/**
 * M4-02 — Durable UsagePort: the same quota/daily/burst gate as the in-memory store, but the
 * counting happens in the database so it survives a restart and holds across instances.
 *
 * WHY THIS EXISTS
 * `createInMemoryUsageStore` cannot enforce anything on Vercel: every function instance has its
 * own memory, so a monthly quota, a daily cap and a burst guard were all per instance, and a
 * cold start forgot them (recorded 27 Nov 2026 in `evidence/M4-02-live-verification-20261127.md`).
 * The tables and transaction functions for the durable version were already applied and exercised
 * (`0001`, `0002`; 16-assertion REST harness, 24 Nov 2026) — only the check path never used them.
 *
 * WHAT IT DOES NOT DO
 * - **No provider-spend reservation.** `m4_reserve_check` can hold budget capacity, but the
 *   per-check price would have to be an approved constant and X-09 (the written funding
 *   arrangement) is still open in the product. `budget: null` is therefore passed on purpose,
 *   and the service's budget port stays a labelled stub. Wiring spend is a separate decision.
 * - **The burst guard is still per process.** The reservation functions have no burst concept and
 *   no count query exposes one, so the sliding window lives in memory here. It is the soft guard
 *   it always was; the monthly and daily caps are the ones that now hold across instances.
 * - **No invented limits.** Quotas arrive as an `Allowance` from the confirmed decision record;
 *   an unconfigured limit is refused by the SQL, never treated as unlimited.
 *
 * FAILURE POLICY — fail closed, and say so honestly
 * If the counting layer cannot be reached, `admitCheck` DENIES with `usage-unavailable` instead of
 * admitting. Admitting without a count is how a spent quota silently becomes unlimited, and the
 * provider call behind it costs money. The user sees a labelled "not now, try again" message —
 * not a safety verdict, and not a silent pass.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { DEFAULT_LIMITS } from './check-boundary.ts';
import type { Allowance, UsageDenial, UsagePort, UsageSubject } from './check-boundary.ts';
import type { DurablePersistence } from './durable-persistence.ts';
import type { QuotaBucket, QuotaPeriodKind, ReservationRecord } from './persistence-port.ts';

const MONTHLY_MESSAGE = 'The monthly check limit for your plan has been reached.';
const DAILY_MESSAGE = 'The daily check limit for your plan has been reached. Please try again tomorrow.';
const BURST_MESSAGE = 'Too many checks were started in a short time. Wait a minute, then try again.';
const UNAVAILABLE_MESSAGE =
  'Your plan usage could not be confirmed just now, so this check was not started. Please try again in a moment.';

/** Length of a first-use-anchored monthly window (review fix #7); mirrors the in-memory store. */
const ANCHORED_MONTH_MS = 30 * 86_400_000;

export type UsageDiagnosticCode = 'admit-unavailable' | 'settle-failed' | 'release-failed';

export interface DurableUsageOptions {
  /** The durable quota port — `createDurableAdapter(...).quota` or any equivalent double. */
  quota: DurablePersistence['quota'];
  /** Sliding burst window in ms (default from DEFAULT_LIMITS: ≈5 checks/minute). */
  burstWindowMs?: number;
  burstMax?: number;
  /** How long a reservation may sit unconverted before the database may reclaim it. */
  leaseMs?: number;
  /** Injectable id source, so tests are deterministic. */
  newId?: () => string;
  /** Best-effort observer; never allowed to break a check. */
  onDiagnostic?: (code: UsageDiagnosticCode) => void;
}

interface DailyWindow {
  periodStart: number;
  periodEnd: number;
}

/** UTC calendar day containing `now`. */
function dayWindow(now: number): DailyWindow {
  const start = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return { periodStart: start, periodEnd: start + 86_400_000 };
}

/** UTC calendar month containing `now`. */
function monthWindow(now: number): DailyWindow {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { periodStart: start, periodEnd: end };
}

function emit(callback: ((code: UsageDiagnosticCode) => void) | undefined, code: UsageDiagnosticCode): void {
  try {
    callback?.(code);
  } catch {
    /* An observer must never break a check. */
  }
}

/**
 * Create a database-backed UsagePort.
 *
 * Ordering mirrors the in-memory store's guarantees: the admission reserves headroom (so
 * simultaneous checks cannot overshoot), only a completed analysis converts the reservation into
 * counted usage, and every non-completed exit releases it. The reservation id is remembered per
 * subject in a FIFO queue, because the `UsagePort` contract carries only the subject key between
 * the three calls.
 */
export function createDurableUsageStore(options: DurableUsageOptions): UsagePort {
  const quota = options.quota;
  const burstWindowMs = options.burstWindowMs ?? DEFAULT_LIMITS.burstWindowMs;
  const burstMax = options.burstMax ?? DEFAULT_LIMITS.burstMax;
  const leaseMs = options.leaseMs ?? 60_000;
  const newId = options.newId ?? (() => crypto.randomUUID());
  /** Per-process burst timestamps. documented limitation: not cross-instance. */
  const burst = new Map<string, number[]>();
  /** Reservation ids in admission order, per subject. */
  const pending = new Map<string, string[]>();

  function burstTimestamps(key: string, now: number): number[] {
    const current = (burst.get(key) ?? []).filter((t) => now - t < burstWindowMs);
    burst.set(key, current);
    return current;
  }

  function pushPending(key: string, reservationId: string): void {
    const queue = pending.get(key) ?? [];
    queue.push(reservationId);
    pending.set(key, queue);
  }

  function shiftPending(key: string): string | null {
    const queue = pending.get(key);
    if (!queue || queue.length === 0) return null;
    const id = queue.shift() as string;
    if (queue.length === 0) pending.delete(key);
    return id;
  }

  async function latestAllowanceBucket(subjectKey: string, kind: QuotaPeriodKind): Promise<QuotaBucket | null> {
    return quota.latestBucket({ subjectKey, periodKind: kind });
  }

  /**
   * The allowance window for this admission. Calendar months for paid plans; for the trial
   * (`monthlyAnchor: 'first-use'`) the stored window is CONTINUED while it is still open, so
   * crossing a calendar-month boundary cannot grant a fresh quota mid-trial.
   */
  async function allowanceWindow(allowance: Allowance, subjectKey: string, now: number) {
    if (allowance.monthlyAnchor !== 'first-use') {
      return { periodKind: 'monthly' as QuotaPeriodKind, ...monthWindow(now) };
    }
    const existing = await latestAllowanceBucket(subjectKey, 'trial');
    const start = existing !== null && now >= existing.periodStart && now < existing.periodStart + ANCHORED_MONTH_MS
      ? existing.periodStart
      : now;
    return { periodKind: 'trial' as QuotaPeriodKind, periodStart: start, periodEnd: start + ANCHORED_MONTH_MS };
  }

  /** After a refusal, name the window that is actually full instead of guessing. */
  async function refusalFor(subjectKey: string, allowance: Allowance, daily: DailyWindow, allowanceKind: {
    periodKind: QuotaPeriodKind; periodStart: number;
  }): Promise<UsageDenial> {
    const [day, plan] = await Promise.all([
      quota.getBucket({ subjectKey, periodKind: 'daily', periodStart: daily.periodStart }),
      quota.getBucket({ subjectKey, periodKind: allowanceKind.periodKind, periodStart: allowanceKind.periodStart }),
    ]);
    const full = (bucket: QuotaBucket | null, limit: number): boolean =>
      bucket !== null && bucket.completedCount + bucket.reservedCount >= limit;
    if (full(plan, allowance.monthly)) return { reason: 'quota-monthly', message: MONTHLY_MESSAGE };
    if (full(day, allowance.daily)) return { reason: 'quota-daily', message: DAILY_MESSAGE };
    // Refused with both counters under their limits: the limit is unconfigured or a concurrent
    // check took the last slot. Either way counting is not trustworthy, so the check does not run.
    return { reason: 'usage-unavailable', message: UNAVAILABLE_MESSAGE };
  }

  return {
    async admitCheck(subject: UsageSubject, now: number): Promise<UsageDenial | null> {
      const key = subject.key;
      const allowance = subject.allowance;
      const seen = burstTimestamps(key, now);
      if (seen.length >= burstMax) return { reason: 'rate-burst', message: BURST_MESSAGE };

      let reservation: ReservationRecord | null = null;
      try {
        const daily = dayWindow(now);
        const plan = await allowanceWindow(allowance, key, now);
        reservation = await quota.reserve({
          subjectKey: key,
          requestKey: newId(),
          now,
          leaseMs,
          dailyBucket: { periodKind: 'daily', periodStart: daily.periodStart, periodEnd: daily.periodEnd, limit: allowance.daily },
          allowanceBucket: {
            periodKind: plan.periodKind,
            periodStart: plan.periodStart,
            periodEnd: plan.periodEnd,
            limit: allowance.monthly,
          },
          // No provider-spend reservation: X-09 is open and no per-check price is approved.
          budget: null,
        });
        if (reservation === null) return await refusalFor(key, allowance, daily, plan);
      } catch {
        // Fail closed: without a count the check would spend uncounted quota and money.
        emit(options.onDiagnostic, 'admit-unavailable');
        return { reason: 'usage-unavailable', message: UNAVAILABLE_MESSAGE };
      }

      burstTimestamps(key, now).push(now);
      pushPending(key, reservation.id);
      return null;
    },

    async recordCompletion(subject: { key: string }, now: number): Promise<void> {
      const reservationId = shiftPending(subject.key);
      if (reservationId === null) return; // nothing was reserved in this process
      try {
        const settled = await quota.settle(reservationId, { analysisStatus: 'completed' }, now);
        if (settled) return;
      } catch {
        /* fall through to the reconciliation path */
      }
      try {
        // Exactly-once settlement failed. Record the outcome so the row is not left dangling in
        // `reserved`; the functions settle quota here and keep only provider spend open.
        await quota.markReconciliationRequired(reservationId, 'completed', now);
      } catch {
        emit(options.onDiagnostic, 'settle-failed');
      }
    },

    async releaseCheck(subject: { key: string }, terminalStatus?: 'limited' | 'unavailable', now?: number): Promise<void> {
      const reservationId = shiftPending(subject.key);
      if (reservationId === null) return;
      const status = terminalStatus ?? 'unavailable';
      // The boundary passes its clock; the epoch-ms fallback exists only for direct callers.
      const at = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
      try {
        const settled = await quota.settle(reservationId, { analysisStatus: status }, at);
        if (settled) return;
      } catch {
        /* fall through */
      }
      try {
        await quota.markReconciliationRequired(reservationId, status, at);
      } catch {
        emit(options.onDiagnostic, 'release-failed');
      }
    },
  };
}
