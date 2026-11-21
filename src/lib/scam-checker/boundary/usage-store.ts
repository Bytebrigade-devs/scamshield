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
 * 5. `readUsage` is the read-only view behind `GET /api/usage`. It reports only numbers the store
 *    already enforces (the allowance latched at admission) and never admits, settles or releases.
 *    Null means "no admission yet" — callers must not turn that into "0 used".
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

/**
 * Read-only counter view for user-facing surfaces (`GET /api/usage`). It reports the store's
 * own numbers; it cannot admit, settle or release anything, and reading never changes what a
 * later `admitCheck` decides beyond lazily rolling expired windows (the same roll an admission
 * performs). `monthlyLimit`/`dailyLimit` are the allowance latched at the last admission, so a
 * caller cannot read a quota the boundary did not apply.
 */
export interface UsageReading {
  /** Completed checks counted in the current monthly window. */
  monthlyUsed: number;
  /** Completed checks counted in the current UTC day (or anchored day). */
  dailyUsed: number;
  /** Allowance latched at the last admission; null until the subject has been admitted. */
  monthlyLimit: number | null;
  dailyLimit: number | null;
  /** Admitted-but-unsettled checks; they reserve headroom but are not counted usage. */
  inFlight: number;
  /** Diagnostic: admissions in the current monthly window, completed or not. */
  monthlyAdmitted: number;
  /** Start of the current monthly window, epoch ms; null for an unused first-use anchor. */
  windowStart: number | null;
  /** True when the monthly window is anchored at first use rather than the calendar month. */
  anchored: boolean;
}

/** Optional read surface; a store that enforces quota does not have to expose one. */
export interface UsageReadPort {
  readUsage(subject: { key: string }, now: number): UsageReading | null;
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
  /** Allowance applied at the most recent admission; null until the subject is admitted. */
  monthlyLimit: number | null;
  dailyLimit: number | null;
  /**
   * Diagnostic only: admissions (including released ones) inside the current monthly window.
   * Never used for a denial — only completed checks consume quota (NFR-M4-10).
   */
  monthAdmitted: number;
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
      r.monthAdmitted = 0;
    }
  } else if (r.monthKey !== monthKeyOf(now)) {
    r.monthKey = monthKeyOf(now);
    r.monthUsed = 0;
    r.monthAdmitted = 0;
  }
}

/** Epoch ms of the first instant of a `YYYY-M` month key; null when the key is malformed. */
function calendarMonthStart(monthKey: string): number | null {
  const parts = monthKey.split('-');
  if (parts.length !== 2) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) return null;
  return Date.UTC(year, month, 1);
}

/**
 * Create an in-memory UsagePort. Suitable for tests and single-process drafts; swap for a
 * persistent implementation before any multi-instance or production claim.
 */
export function createInMemoryUsageStore(options: InMemoryUsageOptions = {}): UsagePort & UsageReadPort {
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
        monthlyLimit: allowance.monthly, dailyLimit: allowance.daily, monthAdmitted: 0,
      };
      records.set(key, r);
    }
    // The window mode is latched from the most recent admission's allowance.
    r.anchored = allowance.monthlyAnchor === 'first-use';
    // The reported limits follow the allowance actually applied, never M2's untrusted copy.
    r.monthlyLimit = allowance.monthly;
    r.dailyLimit = allowance.daily;
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
      r.monthAdmitted += 1;
      return null;
    },

    recordCompletion(subject: { key: string }, now: number): void {
      let r = records.get(subject.key);
      if (r === undefined) {
        // A completion without any admission (direct seeding in tests/ops) counts, as before.
        r = {
          monthKey: monthKeyOf(now), monthUsed: 0, dayKey: dayKeyOf(now), dayUsed: 0,
          burst: [], inFlight: 0, monthAnchor: null, anchored: false,
          monthlyLimit: null, dailyLimit: null, monthAdmitted: 0,
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

    /**
     * Read-only view for `GET /api/usage`. Null means "no accepted check has ever been
     * admitted for this subject", which a caller must report as unknown rather than as zero.
     */
    readUsage(subject: { key: string }, now: number): UsageReading | null {
      const r = records.get(subject.key);
      if (r === undefined) return null;
      rollAndCount(r, now);
      return {
        monthlyUsed: r.monthUsed,
        dailyUsed: r.dayUsed,
        monthlyLimit: r.monthlyLimit,
        dailyLimit: r.dailyLimit,
        inFlight: r.inFlight,
        monthlyAdmitted: r.monthAdmitted,
        windowStart: r.anchored ? r.monthAnchor : calendarMonthStart(r.monthKey),
        anchored: r.anchored,
      };
    },
  };
}
