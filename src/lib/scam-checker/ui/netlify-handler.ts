/**
 * Web-standard adapter for the temporary hosted demo; credentials stay server-side.
 *
 * ENTITLEMENT (23 November 2026): every check now requires a verified caller. Before this, the
 * demo ran the pipeline for any request — Phase 4 proved that an expired and a bogus token each
 * received a completed live-AI analysis, and that anonymous callers could do the same. The gate
 * below mirrors the shared app's rule: no `Authorization` header means sign in; a token that
 * cannot be verified fails closed. A refusal never reaches the provider.
 *
 * VERIFIED SUBJECT (24 November 2026): an admitted check now carries the verified caller's uuid
 * into the service, so the durable check + history rows and the X-13 event are keyed to that user
 * (in memory per-process until `M4_DURABLE_STORE` is set). `GET /api/history` lists the caller's
 * own retained rows, read-only after expiry. The local keyless server keeps the demo subject.
 */
import { DEFAULT_LIMITS, TAXONOMY_VERSION, type EntitlementSnapshot } from '../boundary/check-boundary.ts';
import { resolveM2Outcome, type M2SubscriptionDecision } from '../boundary/m2-entitlement-adapter.ts';
import { resolveHistoryRead } from '../boundary/history-read.ts';
import { createCheckService, liveConfigFromEnv, type CheckSubjectContext } from './check-service.ts';
import { resolveDemoDecision } from './demo-entitlement.ts';
import { selectPersistence } from '../boundary/persistence-mode.ts';
import type { StoredHistoryEntry } from '../boundary/persistence-port.ts';
import type { CheckService } from './check-service.ts';

const MAX_BODY_BYTES = 64 * 1024;

export interface NetlifyHandlerOptions {
  /** Injected in tests; defaults to the live demo resolver (Supabase auth + own-row read). */
  resolveDecision?: (request: Request) => Promise<M2SubscriptionDecision>;
  now?: () => number;
  /** Injected in tests; defaults to an empty reader. The deployment wires the configured store. */
  history?: { listOwned(subjectKey: string, now: number): Promise<StoredHistoryEntry[]> };
}

/** `null` means "no header" and is refused before any resolution is attempted. */
export type GateResult =
  | { ok: true; snapshot: EntitlementSnapshot | null }
  | { ok: false; status: number; error: string };

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  });
}

export function createNetlifyHandler(service: CheckService, options: NetlifyHandlerOptions = {}) {
  const resolveDecision = options.resolveDecision ?? ((request: Request) => resolveDemoDecision(request));
  const now = options.now ?? Date.now;
  const history = options.history ?? { listOwned: async (): Promise<StoredHistoryEntry[]> => [] };

  /**
   * Admission gate. Order matters: the shared app requires a token, then maps M2's decision
   * through the same adapter, and never downgrades a caller who claimed an identity to the demo
   * path. `resolveM2Outcome(null)` is `unavailable`, so a resolver that throws also fails closed.
   */
  async function gate(request: Request): Promise<GateResult> {
    if (request.headers.get('authorization') === null) {
      return { ok: false, status: 401, error: 'sign-in-required' };
    }
    let decision: M2SubscriptionDecision | null = null;
    try {
      decision = await resolveDecision(request);
    } catch {
      decision = null;
    }
    const outcome = resolveM2Outcome(decision, now());
    if (outcome.kind === 'allowed') return { ok: true, snapshot: outcome.snapshot };
    if (outcome.kind === 'unauthenticated') return { ok: false, status: 401, error: 'sign-in-required' };
    if (outcome.kind === 'denied') return { ok: false, status: 403, error: 'access-blocked' };
    return { ok: false, status: 503, error: 'access-unavailable' };
  }

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const metadata = { limits: DEFAULT_LIMITS, taxonomyVersion: TAXONOMY_VERSION };
      if (url.pathname === '/api/config') {
        if (request.method !== 'GET') return json(405, { error: 'method-not-allowed' });
        return json(200, {
          liveConfigured: service.liveConfigured,
          model: service.model,
          fallbackModel: service.fallbackModel,
          api: service.api,
          ...metadata,
        });
      }
      if (url.pathname === '/api/history') {
        if (request.method !== 'GET') return json(405, { error: 'method-not-allowed' });
        if (request.headers.get('authorization') === null) return json(401, { error: 'sign-in-required' });
        let decision: M2SubscriptionDecision | null = null;
        try {
          decision = await resolveDecision(request);
        } catch {
          decision = null;
        }
        const admission = resolveHistoryRead(decision, now());
        if (admission.status !== 200) return json(admission.status, { error: admission.error });
        // Own-row listing only; the subject is the verified id, never a browser-supplied value.
        const entries = await history.listOwned(admission.subjectKey, now());
        return json(200, { access: admission.access, entries });
      }
      if (url.pathname !== '/api/check') return json(404, { error: 'not-found' });
      if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
      const origin = request.headers.get('origin');
      if (origin !== null && origin !== url.origin) return json(403, { error: 'forbidden-origin' });
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return json(415, { error: 'unsupported-media-type' });
      }
      let body: unknown;
      try {
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) {
              await reader.cancel();
              return json(400, { error: 'bad-request' });
            }
            chunks.push(value);
          }
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        body = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        return json(400, { error: 'bad-request' });
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return json(400, { error: 'bad-request' });
      }
      // Admission after the body is validated, before anything can reach the provider.
      const admission = await gate(request);
      if (!admission.ok) return json(admission.status, { error: admission.error });
      const record = body as Record<string, unknown>;
      // The verified subject flows into the durable write; never accepted from the request body.
      const context: CheckSubjectContext | undefined = admission.snapshot === null ? undefined : {
        subjectKey: admission.snapshot.subjectKey,
        planId: admission.snapshot.planId,
        entitlementExpiresAt: admission.snapshot.expiresAt,
      };
      const result = await service.check(record.text, record.sender, context);
      return json(200, { ...result, ...metadata });
    } catch {
      return json(500, { error: 'internal-error' });
    }
  };
}

// Reuse the service within a warm instance. Its existing demo quotas are in memory,
// shared by visitors to that instance, and reset when Netlify replaces the instance.
// `selectPersistence` fails closed: a misconfigured M4_DURABLE_STORE throws at construction
// instead of silently running in memory. Unset (this deployment) keeps the in-memory port.
let handler: ReturnType<typeof createNetlifyHandler> | undefined;
export default async function netlifyHandler(request: Request): Promise<Response> {
  if (handler === undefined) {
    const persistence = selectPersistence(process.env).persistence;
    handler = createNetlifyHandler(
      createCheckService({ live: liveConfigFromEnv(), persistence }),
      { history: persistence.history },
    );
  }
  return handler(request);
}
