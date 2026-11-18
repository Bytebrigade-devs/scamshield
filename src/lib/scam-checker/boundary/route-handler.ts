/**
 * M4-02 — framework-neutral check route handler.
 *
 * Wires the M2 entitlement adapter to the check boundary and maps outcomes to HTTP responses
 * without importing Next.js (or any framework). The same function can be mounted by the
 * shared app later; wiring the real route is gated on the shared branch/CI and M2's helper
 * landing. No network I/O, no env reads, no secrets: the caller supplies session + resolver.
 *
 * Response contract (pinned by tests):
 *   405 method not allowed · 400 malformed body/input · 401 unauthenticated ·
 *   403 no entitlement · 429 quota/rate · 503 unavailable/error · 200 analysed outcome.
 */
import { ACCESS_BLOCKED_MESSAGE, EMPTY_INPUT_MESSAGE } from './check-boundary.ts';
import type { CheckOutcome, CheckRequest } from './check-boundary.ts';
import { resolveM2Outcome, type M2SubscriptionDecision } from './m2-entitlement-adapter.ts';

const ONLY_TEXT_MESSAGE = 'Only the message text is accepted.';
const METHOD_MESSAGE = 'Method not allowed.';
const UNAVAILABLE_MESSAGE = 'The check is temporarily unavailable.';
const NO_STORE = 'no-store';

export interface CheckRouteRequest {
  method: string;
  /** Raw parsed JSON body; the handler is the only place that decides its shape. */
  body: unknown;
  /** Opaque server-verified session from the shared app; never a browser-supplied user id. */
  session: unknown;
}

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface CheckRouteDeps {
  /** M2's `getSubscriptionContext(request)` result, or a test fixture. */
  resolveDecision: (session: unknown) => M2SubscriptionDecision | null | undefined;
  /** Run the boundary check for an allowed request. */
  run: (request: CheckRequest, session: unknown) => Promise<CheckOutcome>;
  now?: () => number;
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): RouteResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': NO_STORE, ...extraHeaders },
    body,
  };
}

/** Parse and constrain the request body to exactly `{ text: non-empty string }`. */
export function parseCheckBody(body: unknown): { ok: true; text: string } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: ONLY_TEXT_MESSAGE };
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'text') return { ok: false, message: ONLY_TEXT_MESSAGE };
  const text = (body as Record<string, unknown>).text;
  if (typeof text !== 'string' || text.trim().length === 0) return { ok: false, message: EMPTY_INPUT_MESSAGE };
  return { ok: true, text };
}

/**
 * Build the route handler. All decisions are made server-side; the browser can only supply
 * the message text and its session (the shared app supplies the verified session).
 */
export function createCheckRoute(deps: CheckRouteDeps): (request: CheckRouteRequest) => Promise<RouteResponse> {
  const now = deps.now ?? Date.now;

  return async function handle(request: CheckRouteRequest): Promise<RouteResponse> {
    if (!request || typeof request.method !== 'string' || request.method.toUpperCase() !== 'POST') {
      return json(405, { error: METHOD_MESSAGE }, { allow: 'POST' });
    }

    const parsed = parseCheckBody(request.body);
    if (!parsed.ok) return json(400, { error: parsed.message });

    let decision: M2SubscriptionDecision | null | undefined;
    try {
      decision = deps.resolveDecision(request.session);
    } catch {
      return json(503, { error: UNAVAILABLE_MESSAGE });
    }

    const outcome = resolveM2Outcome(decision, now());
    if (outcome.kind === 'unauthenticated') return json(401, { error: 'Sign in required.' });
    if (outcome.kind === 'unavailable') return json(503, { error: 'Access check temporarily unavailable.' });
    if (outcome.kind === 'denied') return json(403, { error: ACCESS_BLOCKED_MESSAGE });

    let check: CheckOutcome;
    try {
      check = await deps.run({ text: parsed.text }, request.session);
    } catch {
      return json(503, { error: UNAVAILABLE_MESSAGE });
    }

    if (check.kind === 'rejected') {
      if (check.reason === 'invalid-input') return json(400, { error: check.message });
      if (check.reason === 'access-blocked') return json(403, { error: check.message });
      return json(429, { error: check.message, reason: check.reason });
    }
    return json(200, { outcome: check });
  };
}
