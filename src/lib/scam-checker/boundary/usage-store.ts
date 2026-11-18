/**
 * M4-02 — In-memory UsagePort: server-side quota, daily-cap and burst enforcement.
 *
 * Requirements: FS-M4-08 (a quota/rate denial must decline the provider call), NFR-M4-09
 * (controlled provider usage) and NFR-M4-10 (only completed analyses count; denied and
 * failed attempts never consume quota). Quota values are not invented here — they arrive
 * per check as an `Allowance` from the confirmed decision record
 * (contracts/M4-usage-quotas-and-funding-decision.md §1, 18 October 2026).
 *
 * HONESTY BOUNDARY: this store is in-memory per process — a restart forgets usage, and it
 * is NOT cross-instance enforcement. It exists so the boundary's enforcement behaviour is
 * real and testable now; a persistent store (Supabase) implementing the same port replaces
 * it later. The exact duplicate/count policy remains OD-M4-06 (open); trial semantics are
 * enforced as ≤ 15 per anchored monthly window (review fix #7) while the 7-day trial
 * window boundary is the entitlement layer's responsibility.
 *
 * Design rules (each pinned by usage-store.test.ts):
 * 1. Runtime imports: sibling constants only (DEFAULT_LIMITS) — no environment, no network,
 *    no hidden clock. Time arrives explicitly as `now` epoch-ms parameters.
 * 2. `admitCheck` gates monthly → daily → burst. Review fix #3 (24 Oct 2026): an admitted
 *    check RESERVES one unit of monthly/daily headroom (in-flight) so simultaneous checks
 *    cannot exceed the limit; the burst timestamp is recorded only when admitted, and a
 *    denial records nothing.
 * 3. `recordCompletion` converts one in-flight reservation into counted usage (NFR-M4-10).
 *    `releaseCheck` returns one reservation unused — completed analyses consume quota;
 *    released ones never do. The boundary calls release on every non-completed exit.
 * 4. Monthly/daily windows are UTC calendar month/day of `now` for calendar allowances;
 *    an allowance with `monthlyAnchor: 'first-use'` (review fix #7 — the trial) anchors
 *    its monthly window at the subject's first recorded use for 30 days, so crossing a
 *    calendar-month boundary cannot grant a fresh quota mid-window. The burst window is
 *    sliding and unaffected by anchors.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import { DEFAULT_LIMITS } from './check-boundary.ts';
import type { Allowance, UsageDenial, UsagePort, UsageSubject } from './check-boundary.ts';

export interface InMemoryUsageOptions {
  /** Sliding burst window in ms (default from DEFAULT_LIMITS: ≈5 checks/minute). */
  burstWindowMs?: number;
  burstMax?: number;
}

const MONTHLY_MESSAGE = 'The monthly check limit for your plan has been reached.';
const DAILY_MESSAGE = 'The daily check limit for your plan has been reached. Please try again tomorrow.';
const BURST_MESSAGE = 'Too many checks were started in a short time. Wait a minute, then try again.';

/** Length of a first-use-anchored monthly window (review fix #7). */
const ANCHORED_MONTH_MS = 30 * 86_400_000;

interface UsageRecord {
  monthKey: string;
  monthUsed: number;
  dayKey: string;
  dayUsed: number;
  /** Admission timestamps of checks still inside the burst window. */
  burst: number[];
  /** Checks admitted but not yet completed or released (review fix #3). */
  inFlight: number;
  /** First-use anchor for `monthlyAnchor: 'first-use'` allowances; null until first use. */
  monthAnchor: number | null;
  /** Latched window mode from the subject's most recent admission. */
  anchored: boolean;
}

function monthKeyOf(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function dayKeyOf(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

/**
 * Roll the window counters that changed since the record was last touched, and evaluate
 * the monthly counter in the record's latched window mode (calendar vs first-use anchor).
 */
function rollAndCount(r: UsageRecord, now: number): void {
  if (r.dayKey !== dayKeyOf(now)) {
    r.dayKey = dayKeyOf(now);
    r.dayUsed = 0;
  }
  if (r.anchored) {
    if (r.monthAnchor === null) r.monthAnchor = now;
    else if (now - r.monthAnchor >= ANCHORED_MONTH_MS) {
      r.monthAnchor = now;
      r.monthUsed = 0;
    }
  } else if (r.monthKey !== monthKeyOf(now)) {
    r.monthKey = monthKeyOf(now);
    r.monthUsed = 0;
  }
}

/**
 * Create an in-memory UsagePort. Suitable for tests and single-process drafts; swap for a
 * persistent implementation before any multi-instance or production claim.
 */
export function createInMemoryUsageStore(options: InMemoryUsageOptions = {}): UsagePort {
  const burstWindowMs = options.burstWindowMs ?? DEFAULT_LIMITS.burstWindowMs;
  const burstMax = options.burstMax ?? DEFAULT_LIMITS.burstMax;
  const records = new Map<string, UsageRecord>();

  function recordFor(key: string, now: number, allowance: Allowance): UsageRecord {
    let r = records.get(key);
    if (r === undefined) {
      r = {
        monthKey: monthKeyOf(now), monthUsed: 0, dayKey: dayKeyOf(now), dayUsed: 0,
        burst: [], inFlight: 0, monthAnchor: null,
        anchored: allowance.monthlyAnchor === 'first-use',
      };
      records.set(key, r);
    }
    // The window mode is latched from the most recent admission's allowance.
    r.anchored = allowance.monthlyAnchor === 'first-use';
    rollAndCount(r, now);
    return r;
  }

  return {
    admitCheck(subject: UsageSubject, now: number): UsageDenial | null {
      const allowance: Allowance = subject.allowance;
      const r = recordFor(subject.key, now, allowance);
      // Review fix #3: in-flight reservations count against headroom so N simultaneous
      // admissions can never push completions past the limit.
      if (r.monthUsed + r.inFlight >= allowance.monthly) return { reason: 'quota-monthly', message: MONTHLY_MESSAGE };
      if (r.dayUsed + r.inFlight >= allowance.daily) return { reason: 'quota-daily', message: DAILY_MESSAGE };
      r.burst = r.burst.filter((t) => now - t < burstWindowMs);
      if (r.burst.length >= burstMax) return { reason: 'rate-burst', message: BURST_MESSAGE };
      r.burst.push(now);
      r.inFlight += 1;
      return null;
    },

    recordCompletion(subject: { key: string }, now: number): void {
      let r = records.get(subject.key);
      if (r === undefined) {
        // A completion without any admission (direct seeding in tests/ops) counts, as before.
        r = {
          monthKey: monthKeyOf(now), monthUsed: 0, dayKey: dayKeyOf(now), dayUsed: 0,
          burst: [], inFlight: 0, monthAnchor: null, anchored: false,
        };
        records.set(subject.key, r);
      }
      rollAndCount(r, now);
      // Review fix #3: a completion confirms one reservation when one exists (never below
      // zero), then counts toward monthly/daily usage.
      if (r.inFlight > 0) r.inFlight -= 1;
      r.monthUsed += 1;
      r.dayUsed += 1;
    },

    /** Review fix #3: return one reservation unused (failed/limited checks never consume). */
    releaseCheck(subject: { key: string }): void {
      const r = records.get(subject.key);
      if (r === undefined) return;
      if (r.inFlight > 0) r.inFlight -= 1;
    },
  };
}
