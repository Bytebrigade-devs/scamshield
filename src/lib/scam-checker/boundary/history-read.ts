/**
 * M4-08 — shared history-read admission policy.
 *
 * Maps an M2 decision to the history read outcome using the agreed read policy
 * (`history-store.ts` `historyReadAccess`): an active/trial/cancelled-before-expiry caller gets
 * `full`; an expired/cancelled-after-expiry/suspended/past_due caller gets `read-only` (retention
 * still applies); an unverifiable entitlement gets `none` and is refused.
 *
 * Unlike the check gate, an expired caller is NOT denied here — they may still read retained
 * history. `canRunCheck` governs new checks, not reads, so it is deliberately not consulted.
 *
 * Pure: no I/O, no env, no clock. The caller supplies the resolved decision and `now`, then lists
 * own rows through the configured store's `history.listOwned(subjectKey, now)`. Both the hosted
 * handler and the framework-neutral route use this one function so the access rule cannot drift.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { historyReadAccess, type HistoryReadAccess } from './history-store.ts';
import { resolveM2Outcome, type M2SubscriptionDecision } from './m2-entitlement-adapter.ts';

export type HistoryReadAdmission =
  | { status: 401; error: 'sign-in-required' }
  | { status: 503; error: 'access-unavailable' }
  | { status: 403; error: 'access-blocked' }
  | { status: 200; access: Exclude<HistoryReadAccess, 'none'>; subjectKey: string };

/**
 * Resolve one history read. `unauthenticated` → 401; `unavailable` (including a throwing resolver
 * surfaced as null) → 503; a verified caller whose entitlement cannot be mapped → 403 (`none`);
 * otherwise 200 with the verified subject and the `full`/`read-only` access mode.
 */
export function resolveHistoryRead(
  decision: M2SubscriptionDecision | null | undefined,
  now: number,
): HistoryReadAdmission {
  const outcome = resolveM2Outcome(decision, now);
  if (outcome.kind === 'unauthenticated') return { status: 401, error: 'sign-in-required' };
  if (outcome.kind === 'unavailable') return { status: 503, error: 'access-unavailable' };
  // Verified (allowed or denied): history access follows retention, not the check gate.
  const access = historyReadAccess(outcome.snapshot, now);
  if (access === 'none' || outcome.snapshot === null) return { status: 403, error: 'access-blocked' };
  return { status: 200, access, subjectKey: outcome.snapshot.subjectKey };
}