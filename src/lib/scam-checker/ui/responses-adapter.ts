/**
 * M4 UI prototype — OpenAI Responses API adapter (server-side only).
 *
 * AgentRouter (`https://agentrouter.org/v1`) exposes `POST /v1/responses`, not
 * `/v1/chat/completions`. This adapter implements the same ProviderPort as
 * `../boundary/openai-adapter.ts` for that transport, so the real check boundary and reply
 * validation are unchanged.
 *
 * Key handling mirrors the shared adapter: the key is supplied by server code only, appears
 * only in the Authorization header, and failure modes are enums — there is no path by which
 * the key can enter a result, message or log.
 *
 * The request asks for the boundary's EXISTING draft reply shape (verdict, category,
 * taxonomy_version, reason). Prompt wording and verdict semantics remain OD-M4-04 (open).
 */
import type { ProviderAttempt, ProviderPort } from '../boundary/check-boundary.ts';
import { DEFAULT_DEADLINE_MS, MAX_OUTPUT_TOKENS, emitDiagnostic, httpFailure, outputTokenBudget, providerDeadline, readBoundedBody } from '../boundary/openai-adapter.ts';
import type { AiFailure } from '../boundary/openai-adapter.ts';

export const DEFAULT_RESPONSES_DEADLINE_MS = DEFAULT_DEADLINE_MS;

export interface ResponsesProviderOptions {
  /** Server environment value only. Absent/empty disables live provider use. */
  apiKey: string | undefined;
  /** Full Responses endpoint, normally `https://…/v1/responses`. */
  endpointUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  maxOutputTokens?: number;
  onDiagnostic?: (failure: AiFailure) => void;
  /** Injectable payload builder (server-side harness); defaults to the draft Responses shape. */
  buildPayload?: (text: string, model: string) => unknown;
}

const INSTRUCTIONS =
  'You analyse a pasted message for scam indicators. Reply with ONE JSON object only, with these string fields: ' +
  'verdict (a short assessment label such as "Potentially suspicious" or "No obvious indicators"), ' +
  'category (exactly one of: phishing, romance_scam, fake_invoice, prize_lottery_scam, unknown_other), ' +
  'taxonomy_version (exactly "0.1.0-draft"), ' +
  'reason (one sentence explaining the assessment, at most 800 characters). ' +
  'The result is guidance for a human reviewer, not a guarantee that a message is safe.';

/** Responses request body: `instructions` + `input`, per the Responses API. */
export function buildResponsesPayload(text: string, model: string): unknown {
  return {
    model,
    instructions: INSTRUCTIONS,
    input: text,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  };
}

/** Strip a surrounding markdown code fence (transport convenience only; validation is unchanged). */
function unfence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/**
 * Extract the assistant text from a Responses envelope:
 *  - top-level `output_text` (SDK convenience form), or
 *  - `output[] → item.type === 'message' → content[] → item.type === 'output_text' → text`.
 */
export function extractResponsesText(envelope: unknown): string | null {
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) return null;
  const record = envelope as Record<string, unknown>;

  if (typeof record.output_text === 'string' && record.output_text.trim().length > 0) {
    return record.output_text;
  }

  const output = record.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (entry.type !== 'message' || !Array.isArray(entry.content)) continue;
    for (const part of entry.content) {
      if (typeof part !== 'object' || part === null) continue;
      const content = part as Record<string, unknown>;
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }
  return null;
}

export function createResponsesProvider(options: ResponsesProviderOptions): ProviderPort {
  const buildPayload = options.buildPayload ?? buildResponsesPayload;
  const deadlineMs = providerDeadline(options.deadlineMs);
  const maxOutputTokens = outputTokenBudget(options.maxOutputTokens);
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async analyze(text: string): Promise<ProviderAttempt> {
      if (typeof options.apiKey !== 'string' || options.apiKey.trim().length === 0) {
        return { kind: 'unconfigured' };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deadlineMs);
      try {
        const payload = buildPayload(text, options.model);
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          emitDiagnostic(options.onDiagnostic, { code: 'invalid-response' });
          return { kind: 'failed', failure: 'bad-json' };
        }
        const response = await doFetch(options.endpointUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey.trim()}`,
          },
          body: JSON.stringify({ ...payload, max_output_tokens: maxOutputTokens }),
          signal: controller.signal,
        });
        if (!response.ok) {
          emitDiagnostic(options.onDiagnostic, httpFailure(response));
          await response.body?.cancel().catch(() => {});
          return { kind: 'failed', failure: 'http-error' };
        }
        const body = await readBoundedBody(response);
        if (body === null) {
          emitDiagnostic(options.onDiagnostic, { code: 'invalid-response' });
          return { kind: 'failed', failure: 'bad-json' };
        }
        let envelope: unknown;
        try {
          envelope = JSON.parse(body);
        } catch {
          emitDiagnostic(options.onDiagnostic, { code: 'invalid-response' });
          return { kind: 'failed', failure: 'bad-json' };
        }
        if (typeof envelope === 'object' && envelope !== null && !Array.isArray(envelope)) {
          const record = envelope as Record<string, unknown>;
          if (record.status === 'incomplete') {
            const details = record.incomplete_details;
            const outputLimit = typeof details === 'object' && details !== null
              && (details as { reason?: unknown }).reason === 'max_output_tokens';
            emitDiagnostic(options.onDiagnostic, { code: outputLimit ? 'output-limit' : 'invalid-response' });
            return { kind: 'failed', failure: 'bad-json' };
          }
        }
        const extracted = extractResponsesText(envelope);
        if (extracted === null) {
          emitDiagnostic(options.onDiagnostic, { code: 'invalid-response' });
          return { kind: 'failed', failure: 'bad-json' };
        }
        try {
          return { kind: 'ok', json: JSON.parse(unfence(extracted)) as unknown };
        } catch {
          emitDiagnostic(options.onDiagnostic, { code: 'invalid-response' });
          return { kind: 'failed', failure: 'bad-json' };
        }
      } catch {
        if (controller.signal.aborted) {
          emitDiagnostic(options.onDiagnostic, { code: 'timeout' });
          return { kind: 'failed', failure: 'timeout' };
        }
        emitDiagnostic(options.onDiagnostic, { code: 'network' });
        return { kind: 'failed', failure: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
