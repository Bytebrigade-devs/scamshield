/**
 * M4 — request-level entitlement gate for the mounted check route (20 November 2026).
 *
 * Maps M2's `getSubscriptionContext(request)` decision plus the presence of an Authorization
 * header to one of three route behaviours:
 *   - **no Authorization header** → `demo` (the browser SPA cannot attach a session token yet;
 *     the check runs under the labelled demo subject — owner decision D3, 20 Nov 2026);
 *   - **Authorization present, verified and allowed** → `allowed` with the caller's
 *     server-derived subject key, so feedback and any later per-subject state file correctly;
 *   - **anything else with a header** → fail closed: unauthenticated 401, denied 403,
 *     unavailable/malformed 503. A caller that *claims* identity is never downgraded to demo.
 *
 * Pure and transport-free: the caller supplies the already-fetched decision and the clock.
 * Repo-only companion to the mirrored `m2-entitlement-adapter.ts` (same precedent as
 * `reason-highlights.test.ts`), so the gate is covered by the CI library glob.
 */
import { resolveM2Outcome, type M2SubscriptionDecision } from './m2-entitlement-adapter.ts';

export type RequestEntitlementGate =
  | { kind: 'demo' }
  | { kind: 'allowed'; subjectKey: string }
  | { kind: 'rejected'; status: 401 | 403 | 503; error: string };

/** Honest limit: per-user usage counters are NOT enforced yet (in-memory, single-subject). */
export function gateRequestAccess(
  decision: M2SubscriptionDecision | null | undefined,
  hasAuthorization: boolean,
  now: number,
): RequestEntitlementGate {
  if (!hasAuthorization) return { kind: 'demo' };
  const outcome = resolveM2Outcome(decision, now);
  if (outcome.kind === 'allowed') {
    return { kind: 'allowed', subjectKey: outcome.snapshot!.subjectKey };
  }
  if (outcome.kind === 'unauthenticated') return { kind: 'rejected', status: 401, error: outcome.reason };
  if (outcome.kind === 'denied') return { kind: 'rejected', status: 403, error: outcome.reason };
  return { kind: 'rejected', status: 503, error: outcome.reason };
}
