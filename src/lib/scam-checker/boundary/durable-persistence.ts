/**
 * M4 — durable persistence interface (async).
 *
 * Implements the owner-side decision of 19 November 2026
 * (workspace evidence: M4-async-persistence-decision-20261119.md — not in this repository): a real Supabase client performs
 * async I/O, so durable persistence is expressed as a Promise-returning interface mirroring
 * `persistence-port.ts`, while the synchronous port stays the deterministic test contract.
 *
 * The live adapter (not built here) will implement this interface by calling the draft
 * migration-0002 transaction functions through the server-only service-role client, AFTER
 * session/ownership/entitlement/input verification. The names are recorded in
 * `M4_TRANSACTION_FUNCTIONS` so the adapter, the SQL drafts and this contract cannot drift
 * silently. The SQL drafts (0001 rev 5 / 0002 rev 5) were reviewed by Prashni (21 Nov) and
 * independently by Lahiru (22 Nov) and merged in PR #52; they are NOT applied — Supabase
 * access remains pending, and the steward role moved to the M4 owner (22 Nov).
 *
 * HONESTY BOUNDARY: this module defines a contract and an async wrapper over an injected
 * synchronous port. There is NO Supabase client, NO SQL, NO table, NO network and no clock.
 * `createAsyncPersistence` exists so the durable contract can be exercised today against the
 * in-memory adapter; it is not a durable store.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import type {
  BudgetBucket, BudgetBucketKey, DeleteCounts, PersistencePort, QuotaBucket, QuotaBucketKey,
  QuotaReservationInput, ReservationRecord, SettleResult, StoredCheck, StoredCheckInput,
  StoredHistoryEntry, StoredUsageEvent,
} from './persistence-port.ts';
import type { AnalysisStatus } from './check-boundary.ts';
import type { FeedbackEntry, FeedbackEntryInput } from './feedback-store.ts';

/**
 * Durable storage contract. Same operations and recorded semantics as `PersistencePort`
 * (own-row reads, atomic save, exactly-once settlement where ONLY completed consumes quota,
 * idempotent append/upsert, retention purge, limit-enforcing admission, and direction-(c)
 * account deletion) but every call resolves asynchronously.
 */
export interface DurablePersistence {
  checks: {
    /** Atomic check + findings + optional history-row save; null for invalid input. */
    save(input: StoredCheckInput): Promise<StoredCheck | null>;
    /** Own-row read only; expired or foreign rows resolve to null. */
    getOwned(checkId: string, subjectKey: string, now: number): Promise<StoredCheck | null>;
    /** Deletes the check with its findings, history and feedback rows. */
    deleteCheck(checkId: string, subjectKey: string): Promise<boolean>;
    /** Physically removes expired checks and dependent rows; resolves to checks removed. */
    purgeExpired(now: number): Promise<number>;
  };
  history: {
    /** Own-row listing, newest first, expired rows excluded. */
    listOwned(subjectKey: string, now: number): Promise<StoredHistoryEntry[]>;
  };
  feedback: {
    /** Idempotent upsert keyed by subject + check; null for invalid input. */
    save(input: FeedbackEntryInput): Promise<FeedbackEntry | null>;
    listOwned(subjectKey: string): Promise<FeedbackEntry[]>;
  };
  events: {
    /** Idempotent append by event id; identical duplicate true, conflicting duplicate false. */
    append(event: StoredUsageEvent): Promise<boolean>;
    /** Dashboard-side aggregate read; synthetic tests only until a consumer read path exists. */
    listAll(): Promise<StoredUsageEvent[]>;
    /** Removes events whose occurred_at is before the given epoch ms. */
    purgeBefore(epochMs: number): Promise<number>;
  };
  quota: {
    getOrCreateBucket(key: QuotaBucketKey & { periodEnd: number; limitCount?: number | null }, now: number): Promise<QuotaBucket>;
    /** Atomically reserves one unit; refuses (null) when a limit is unconfigured or exceeded. */
    reserve(input: QuotaReservationInput): Promise<ReservationRecord | null>;
    /** Converts or releases exactly once; only completed consumes quota. */
    settle(reservationId: string, result: SettleResult, now: number): Promise<boolean>;
    /** Records the outcome and settles quota now; only the provider spend stays open. */
    markReconciliationRequired(reservationId: string, status: AnalysisStatus, now: number): Promise<boolean>;
    /** Closes a reconciliation's provider spend at a known amount; quota is already settled. */
    finalizeReconciliation(reservationId: string, actualSpend: number, now: number): Promise<boolean>;
    reservationByRequestKey(requestKey: string): Promise<ReservationRecord | null>;
    getBucket(key: QuotaBucketKey): Promise<QuotaBucket | null>;
  };
  budget: {
    getBucket(key: BudgetBucketKey): Promise<BudgetBucket | null>;
  };
  /**
   * Account deletion (direction (c)): resolves outstanding reservations/charges, then removes
   * the subject's checks/findings/history/feedback and user-linked quota buckets/reservations.
   * Non-user-linked budget totals are retained.
   */
  deleteSubject(subjectKey: string): Promise<DeleteCounts>;
}

/**
 * Transaction functions the live adapter must call (draft migration 0002). Recorded here so
 * the interface and the SQL drafts share one name list; nothing is executed or verified by
 * this constant — the SQL drafts are reviewed and merged (#52) but not applied.
 */
export const M4_TRANSACTION_FUNCTIONS = Object.freeze({
  saveCheck: 'm4_save_check',
  reserveCheck: 'm4_reserve_check',
  settleReservation: 'm4_settle_reservation',
  markReconciliation: 'm4_mark_reconciliation',
  finalizeReconciliation: 'm4_finalize_reconciliation',
  deleteSubject: 'm4_delete_subject',
  purgeExpired: 'm4_purge_expired',
});

/**
 * Wrap any synchronous `PersistencePort` as the async durable contract.
 *
 * Purpose: a deterministic, dependency-free double so the durable interface and the boundary
 * integration can be written and tested before Supabase access exists. Validation, idempotency
 * and settlement semantics stay in the wrapped port; this wrapper only adds the async shape and
 * converts a thrown port error into a rejected promise.
 */
export function createAsyncPersistence(port: PersistencePort): DurablePersistence {
  return {
    checks: {
      save: async input => port.checks.save(input),
      getOwned: async (checkId, subjectKey, now) => port.checks.getOwned(checkId, subjectKey, now),
      deleteCheck: async (checkId, subjectKey) => port.checks.deleteCheck(checkId, subjectKey),
      purgeExpired: async now => port.checks.purgeExpired(now),
    },
    history: {
      listOwned: async (subjectKey, now) => port.history.listOwned(subjectKey, now),
    },
    feedback: {
      save: async input => port.feedback.save(input),
      listOwned: async subjectKey => port.feedback.listOwned(subjectKey),
    },
    events: {
      append: async event => port.events.append(event),
      listAll: async () => port.events.listAll(),
      purgeBefore: async epochMs => port.events.purgeBefore(epochMs),
    },
    quota: {
      getOrCreateBucket: async (key, now) => port.quota.getOrCreateBucket(key, now),
      reserve: async input => port.quota.reserve(input),
      settle: async (reservationId, result, now) => port.quota.settle(reservationId, result, now),
      markReconciliationRequired: async (reservationId, status, now) =>
        port.quota.markReconciliationRequired(reservationId, status, now),
      finalizeReconciliation: async (reservationId, actualSpend, now) =>
        port.quota.finalizeReconciliation(reservationId, actualSpend, now),
      reservationByRequestKey: async requestKey => port.quota.reservationByRequestKey(requestKey),
      getBucket: async key => port.quota.getBucket(key),
    },
    budget: {
      getBucket: async key => port.budget.getBucket(key),
    },
    deleteSubject: async subjectKey => port.deleteSubject(subjectKey),
  };
}
