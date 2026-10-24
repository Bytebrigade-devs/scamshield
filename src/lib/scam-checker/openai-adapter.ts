/**
 * M4-02 — OpenAI provider adapter (server-side only).
 *
 * Task (MODULE-TASK-BREAKDOWN §4): "Server-side API route wrapping OpenAI — key never
 * client-side · done when: key only in server env vars". NFR-M4-01: the API key is
 * supplied by SERVER code only (the future route handler reads process.env.OPENAI_API_KEY);
 * this module never reads the environment itself, never logs the key, and returns only
 * enum-coded failures — there is structurally no path by which the key can enter a result,
 * message or log line.
 *
 * GATES RESPECTED: X-09 remains open — no live call is authorized or performed by this
 * work; tests inject `fetchImpl` and never touch the network. One model, ONE attempt per
 * analyze() call, no retry and no fallback model (owner decision 19 Oct 2026): a primary
 * failure ends in the boundary's labelled unavailable state, never a second model guess and
 * never a fabricated verdict. The default request payload is a DRAFT transport shape — the
 * analysis prompt and result semantics remain OD-M4-04 (open).
 *
 * Design rules (each pinned by openai-adapter.test.ts):
 * 1. Missing/empty apiKey → `{ kind: 'unconfigured' }` with zero fetch calls: live
 *    provider use is disabled (FS-M4-05/NFR-M4-01) and the boundary shows its labelled
 *    rules-only result instead.
 * 2. The provider deadline is enforced with AbortController; an abort is reported as
 *    'timeout' (FS-M4-06 bounded response). The draft default below is not a reviewed
 *    deadline (OD-M4-04).
 * 3. Exactly one fetch per analyze() call; the key appears only in the Authorization
 *    header of that request.
 * 4. Non-2xx status → 'http-error' (no response body is trusted or returned); a network
 *    exception → 'network'; unparseable JSON → 'bad-json' (FR-M4-04).
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import type { ProviderAttempt, ProviderPort } from './check-boundary.ts';

/** Primary model, one shared model for all tiers (M4-usage-quotas decision §2, 18 Oct 2026). */
export const DEFAULT_MODEL = 'gpt-5.6-luna';

/** Draft provider deadline — the reviewed value is still open under OD-M4-04. */
export const DEFAULT_DEADLINE_MS = 20_000;

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface OpenAIProviderOptions {
  /** Server environment value only. Absent/empty disables live provider use (FS-M4-05). */
  apiKey: string | undefined;
  model?: string;
  /** Injectable for tests — never touch the network in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  endpointUrl?: string;
  /** DRAFT payload builder — replaced when OD-M4-04 fixes the analysis prompt and schema. */
  buildPayload?: (text: string, model: string) => unknown;
}

/** DRAFT minimal chat-completions payload requesting a JSON object (OD-M4-04 open). */
function defaultPayload(text: string, model: string): unknown {
  return {
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'DRAFT (OD-M4-04 open): analyse the pasted message for scam indicators and reply with one JSON object containing string fields "verdict", "category", "taxonomy_version" and "reason".',
      },
      { role: 'user', content: text },
    ],
  };
}

/**
 * Create the OpenAI ProviderPort. Server-side use only: the caller supplies the key from
 * server environment variables; this adapter exposes it nowhere else.
 */
export function createOpenAIProvider(options: OpenAIProviderOptions): ProviderPort {
  const model = options.model ?? DEFAULT_MODEL;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const endpointUrl = options.endpointUrl ?? DEFAULT_ENDPOINT;
  const buildPayload = options.buildPayload ?? defaultPayload;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async analyze(text: string): Promise<ProviderAttempt> {
      if (typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
        return { kind: 'unconfigured' };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deadlineMs);
      try {
        const response = await doFetch(endpointUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(buildPayload(text, model)),
          signal: controller.signal,
        });
        if (!response.ok) return { kind: 'failed', failure: 'http-error' };
        let jsonText: string;
        try {
          jsonText = await response.text();
        } catch {
          return { kind: 'failed', failure: 'network' };
        }
        try {
          return { kind: 'ok', json: JSON.parse(jsonText) as unknown };
        } catch {
          return { kind: 'failed', failure: 'bad-json' };
        }
      } catch {
        // A deadline abort is a timeout (FS-M4-06); anything else is a network failure.
        if (controller.signal.aborted) return { kind: 'failed', failure: 'timeout' };
        return { kind: 'failed', failure: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
