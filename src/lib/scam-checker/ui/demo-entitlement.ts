/**
 * M4 — demo-side entitlement resolution for the hosted demo.
 *
 * The shared app resolves entitlement with M2's `getSubscriptionContext(request)` in
 * `src/lib/subscription-server.ts`, which uses the Supabase JS SDK. This demo cannot import it
 * (different tree) and the workspace is zero-dependency by convention, so this module performs
 * the same two reads with plain `fetch` and returns the **same decision shape** M2 confirmed
 * (`M2SubscriptionDecision`), which `resolveM2Outcome` then maps to allowed / denied /
 * unauthenticated / unavailable. There is deliberately no second gate here.
 *
 * WHAT IT READS — nothing secret, nothing user-content:
 *   1. `GET {url}/auth/v1/user` with the anon key + the caller's bearer token → the verified user.
 *   2. `GET {url}/rest/v1/subscriptions?...&user_id=eq.<id>` with the same headers → the caller's
 *      own row (the 0001-era RLS policy allows exactly own-row reads).
 * The service-role key is never used, so the demo cannot read anyone else's row.
 *
 * FAIL CLOSED: a missing configuration, a network failure, a non-2xx from either call or an
 * unexpected payload all resolve to `unavailable` (→ HTTP 503), never to an implicit demo path.
 *
 * AUTHORITY: M2's helper remains the source of truth. The evaluation below is a ~15-line mirror
 * of `src/lib/entitlement.ts`; if a shared helper ever becomes importable here, delete it.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import type { M2SubscriptionDecision } from '../boundary/m2-entitlement-adapter.ts';

/** Environment names the demo reads. Values are never logged or returned. */
export const DEMO_ENTITLEMENT_ENV = Object.freeze({
  url: 'NEXT_PUBLIC_SUPABASE_URL',
  anonKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
});

const PLAN_IDS = new Set(['sentinel', 'guardian', 'aegis']);
const ENTITLED_STATUSES = new Set(['trialing', 'active', 'cancelled']);
const SUBSCRIPTION_COLUMNS = 'user_id,plan,status,billing_cycle,started_at,renews_at,cancelled_at';
const BEARER = /^Bearer\s+(\S+)$/i;

type Row = Record<string, unknown>;

export interface DemoEntitlementOptions {
  /** Overrides the process environment (tests pass explicit values). */
  env?: { url?: string | undefined; anonKey?: string | undefined };
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** The nested decision M2's helper returns. `limits` is null: `resolveM2Outcome` ignores it and M4 owns quota. */
export interface DemoEntitlement {
  canRunCheck: boolean;
  reason: 'valid_entitlement' | 'subscription_required';
  planId: string | null;
  status: string | null;
  expiresAt: string | null;
  limits: null;
}

/**
 * Mirror of M2's `evaluateEntitlement`: a valid plan, an entitled status, a started window and an
 * expiry still in the future. Anything else refuses.
 */
export function evaluateDemoEntitlement(subscription: Row | null, now: number): DemoEntitlement {
  const plan = typeof subscription?.plan === 'string' && PLAN_IDS.has(subscription.plan)
    ? subscription.plan
    : null;
  const status = typeof subscription?.status === 'string' ? subscription.status : null;
  const startedAt = typeof subscription?.started_at === 'string' ? Date.parse(subscription.started_at) : Number.NaN;
  const expiresAt = typeof subscription?.renews_at === 'string' ? Date.parse(subscription.renews_at) : Number.NaN;

  const allowed = Boolean(
    plan !== null
    && status !== null && ENTITLED_STATUSES.has(status)
    && Number.isFinite(startedAt) && startedAt <= now
    && Number.isFinite(expiresAt) && expiresAt > now,
  );

  return {
    canRunCheck: allowed,
    reason: allowed ? 'valid_entitlement' : 'subscription_required',
    planId: plan,
    status,
    expiresAt: typeof subscription?.renews_at === 'string' ? subscription.renews_at : null,
    limits: null,
  };
}

function headers(anonKey: string, token: string): Record<string, string> {
  return { apikey: anonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/**
 * Resolve the caller's entitlement for the demo. Never throws: every failure becomes a decision
 * the gate already understands.
 */
export async function resolveDemoDecision(
  request: Request,
  options: DemoEntitlementOptions = {},
): Promise<M2SubscriptionDecision> {
  const env = options.env ?? {
    url: process.env[DEMO_ENTITLEMENT_ENV.url],
    anonKey: process.env[DEMO_ENTITLEMENT_ENV.anonKey],
  };
  const url = (env.url ?? '').trim().replace(/\/+$/, '');
  const anonKey = (env.anonKey ?? '').trim();
  if (url.length === 0 || anonKey.length === 0) return { kind: 'unavailable' };

  const token = request.headers.get('authorization')?.match(BEARER)?.[1];
  if (!token) return { kind: 'unauthenticated' };

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = (options.now ?? Date.now)();

  let userId: string;
  try {
    const response = await fetchImpl(`${url}/auth/v1/user`, { headers: headers(anonKey, token) });
    if (response.status === 401 || response.status === 403) return { kind: 'unauthenticated' };
    if (!response.ok) return { kind: 'unavailable' };
    const body = (await response.json()) as Row | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (id.length === 0) return { kind: 'unauthenticated' };
    userId = id;
  } catch {
    return { kind: 'unavailable' };
  }

  let subscription: Row | null;
  try {
    const query = `select=${SUBSCRIPTION_COLUMNS}&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const response = await fetchImpl(`${url}/rest/v1/subscriptions?${query}`, {
      headers: headers(anonKey, token),
    });
    if (!response.ok) return { kind: 'unavailable' };
    const rows = await response.json();
    subscription = Array.isArray(rows) && rows.length > 0 ? rows[0] as Row : null;
  } catch {
    return { kind: 'unavailable' };
  }

  // Only the fields the adapter consumes are carried: `resolveM2Outcome` reads `kind`, the
  // subject from `user.id`, and the nested `entitlement`. M2's own result also includes the raw
  // `subscription` row, but the workspace type deliberately does not declare it, and the demo has
  // no use for it — so it is not spread into the decision.
  return {
    kind: 'verified',
    user: { id: userId },
    entitlement: evaluateDemoEntitlement(subscription, now),
  };
}
