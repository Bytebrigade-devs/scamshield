/**
 * M4-08 — framework-neutral history read route handler.
 *
 * Sibling of `route-handler.ts` (createCheckRoute): wires the shared history-read admission policy
 * to an own-row listing without importing Next.js (or any framework). The shared app mounts it;
 * the caller supplies the verified session + resolver + store reader. No network I/O, no env reads,
 * no secrets. The subject is always the verified id from the decision, never browser-supplied.
 *
 * Response contract (pinned by tests):
 *   405 method not allowed · 401 unauthenticated · 403 no readable entitlement ·
 *   503 unavailable/error · 200 { access: 'full' | 'read-only', entries }.
 * An expired caller is read-only, not denied — retention still applies (history-store.ts policy).
 */
import { ACCESS_BLOCKED_MESSAGE } from './check-boundary.ts';
import { resolveHistoryRead } from './history-read.ts';
import type { M2SubscriptionDecision } from './m2-entitlement-adapter.ts';
import type { StoredHistoryEntry } from './persistence-port.ts';
import type { RouteResponse } from './route-handler.ts';

const METHOD_MESSAGE = 'Method not allowed.';
const UNAVAILABLE_MESSAGE = 'Access check temporarily unavailable.';
const HISTORY_UNAVAILABLE_MESSAGE = 'History is temporarily unavailable.';
const NO_STORE = 'no-store';

export interface HistoryRouteRequest {
  method: string;
  /** Opaque server-verified session from the shared app; never a browser-supplied user id. */
  session: unknown;
}

export interface HistoryRouteDeps {
  /** M2's `getSubscriptionContext(request)` result, or a test fixture. */
  resolveDecision: (session: unknown) => M2SubscriptionDecision | null | undefined;
  /** Own-row listing from the configured store (memory or durable). */
  listOwned: (subjectKey: string, now: number) => Promise<StoredHistoryEntry[]>;
  now?: () => number;
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): RouteResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': NO_STORE, ...extraHeaders },
    body,
  };
}

/** Build the history read route. All decisions are server-side; the browser supplies only its session. */
export function createHistoryRoute(deps: HistoryRouteDeps): (request: HistoryRouteRequest) => Promise<RouteResponse> {
  const now = deps.now ?? Date.now;

  return async function handle(request: HistoryRouteRequest): Promise<RouteResponse> {
    if (!request || typeof request.method !== 'string' || request.method.toUpperCase() !== 'GET') {
      return json(405, { error: METHOD_MESSAGE }, { allow: 'GET' });
    }

    let decision: M2SubscriptionDecision | null | undefined;
    try {
      decision = deps.resolveDecision(request.session);
    } catch {
      return json(503, { error: UNAVAILABLE_MESSAGE });
    }

    const admission = resolveHistoryRead(decision, now());
    if (admission.status === 401) return json(401, { error: 'Sign in required.' });
    if (admission.status === 403) return json(403, { error: ACCESS_BLOCKED_MESSAGE });
    if (admission.status !== 200) return json(503, { error: UNAVAILABLE_MESSAGE });

    let entries: StoredHistoryEntry[];
    try {
      entries = await deps.listOwned(admission.subjectKey, now());
    } catch {
      return json(503, { error: HISTORY_UNAVAILABLE_MESSAGE });
    }
    return json(200, { access: admission.access, entries });
  };
}