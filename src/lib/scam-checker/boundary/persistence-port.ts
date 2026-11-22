/**
 * M4 — persistence port (durable-store boundary, in-memory adapter only).
 *
 * This module defines the storage contract M4 will implement when the shared database is
 * approved. It follows the recorded positions without creating any database object:
 * - the team-approved steward design (19 Nov 2026; SQL drafts reviewed and merged in #52,
 *   not applied): checks, findings, history,
 *   feedback, usage events, quota/budget buckets and usage reservations;
 * - M2-J access rule (18 Nov 2026): M4 owns history and feedback; users read only their own
 *   rows; no browser writes; verified server routes write with the service role; account
 *   deletion removes the user's rows;
 * - retention (TC-2): 30/90/180-day windows; expired rows are hidden and then purged;
 * - quota (code-verified 19 Nov 2026): **only completed** analyses consume quota; `limited`
 *   (rules-only) and `unavailable` release their reservation;
 * - events: the eight-field `m4.check_outcome` and the agreed nine-field
 *   `0.2.0-draft` revision (`subject_ref` agreed by Vishmi + Lahiru 19 Nov and the
 *   steward 20 Nov). The durable table stores only `0.1.0-draft` until the
 *   separate nine-field migration adds the column; this port accepts both shapes.
 * - account deletion (steward direction (c), 21 Nov; Suraji confirmed the privacy direction
 *   on 22 Nov 2026): outstanding reservations/charges are resolved, then the
 *   subject's user-linked quota buckets and reservations are removed;
 *   non-user-linked budget totals are retained. Deleting history alone never
 *   resets quota.
 *
 * HONESTY BOUNDARY: no SQL, no Supabase client, no tables, no network. The in-memory
 * adapter exists so the boundary integration and tests can be written now; a Supabase
 * adapter must implement the same port only after the reviewed SQL is applied and
 * Supabase access exists.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import {
  DRAFT_VERDICT_LABELS, MAX_REASON_CHARS,
  type AnalysisMode, type AnalysisStatus, type ReasonHighlight, type RiskLevel,
  type VerdictLabel,
} from './check-boundary.ts';
import {
  EVENT_CONTRACT_VERSION_V2, isValidAnalysisPair,
  validateCheckOutcomeEvent, validateCheckOutcomeEventV2,
  type CheckOutcomeEvent, type CheckOutcomeEventV2,
} from './x13-event.ts';
import { CATEGORY_IDS, type CategoryId } from './taxonomy.ts';
import { MAX_SNIPPET_CHARS, type HistoryEntry } from './history-store.ts';
import type { FeedbackEntry, FeedbackEntryInput } from './feedback-store.ts';

/** Proposed caps from the steward's design; kept here so the adapter and DB can share them. */
export const MAX_HIGHLIGHTS = 4;
export const MAX_LIMITATIONS = 10;

export interface StoredFindingInput {
  ruleId: string;
  excerpt: string;
  /** UTF-16 offsets into the analysed input (not the reason). */
  start: number;
  end: number;
  contextNote?: string | null;
}

export interface StoredFinding extends StoredFindingInput {
  id: string;
  checkId: string;
}

export interface StoredCheckInput {
  /** Opaque check id (no whitespace); the row identity in the proposed design. */
  checkId: string;
  /** Server-derived subject (M2 verified user id); never browser-supplied authority. */
  subjectKey: string;
  planId: string;
  /** Epoch ms of the accepted result. */
  createdAt: number;
  /** Server-calculated retention deadline (epoch ms). */
  expiresAt: number;
  analysisStatus: AnalysisStatus;
  analysisMode: AnalysisMode;
  categoryId: CategoryId;
  taxonomyVersion: string;
  /** Reply label; null when the result has no validated reply. */
  verdictLabel: VerdictLabel | null;
  riskLevel: RiskLevel | null;
  /** Null and '' are both allowed (steward design); max MAX_REASON_CHARS. */
  reason: string | null;
  reasonHighlights: ReasonHighlight[];
  limitations: string[];
  findings: StoredFindingInput[];
  /** History row written in the same transaction; values are derived from the check. */
  history?: { snippet: string; verdictLabel: VerdictLabel } | null;
}

export interface StoredCheck extends Omit<StoredCheckInput, 'findings' | 'history'> {
  findings: StoredFinding[];
  historyId: string | null;
}

export interface StoredHistoryEntry extends HistoryEntry {
  checkId: string;
  /** Retention deadline (epoch ms); rows are hidden at/after it. */
  expiresAt: number;
}

export type QuotaPeriodKind = 'daily' | 'monthly' | 'trial';

export interface QuotaBucketKey {
  subjectKey: string;
  periodKind: QuotaPeriodKind;
  /** Epoch ms at the period start (UTC day/month or anchored trial window). */
  periodStart: number;
}

export interface QuotaBucket extends QuotaBucketKey {
  id: string;
  periodEnd: number;
  /** Trusted plan allowance; null = unconfigured, and reserve must refuse admission. */
  limitCount: number | null;
  completedCount: number;
  reservedCount: number;
  updatedAt: number;
}

export interface BudgetBucketKey {
  budgetKey: string;
  periodStart: number;
}

export interface BudgetBucket extends BudgetBucketKey {
  id: string;
  periodEnd: number;
  currency: string;
  limitAmount: number;
  reservedAmount: number;
  spentAmount: number;
  updatedAt: number;
}

export type ReservationState = 'reserved' | 'completed' | 'released' | 'reconciliation_required';

export interface QuotaReservationInput {
  subjectKey: string;
  /** Unique delivery/admission key; a duplicate returns the existing reservation. */
  requestKey: string;
  now: number;
  leaseMs: number;
  dailyBucket: Omit<QuotaBucketKey, 'subjectKey'> & { periodEnd: number; limit: number | null };
  allowanceBucket: Omit<QuotaBucketKey, 'subjectKey'> & { periodEnd: number; limit: number | null };
  /** Optional provider-spend reservation for this check (rules-only work passes null). */
  budget?: {
    bucket: BudgetBucketKey;
    periodEnd: number;
    currency: string;
    limitAmount: number;
    reservedAmount: number;
  } | null;
}

export interface ReservationRecord {
  id: string;
  requestKey: string;
  subjectKey: string;
  dailyBucketId: string;
  allowanceBucketId: string;
  budgetBucketId: string | null;
  state: ReservationState;
  /** Anal outcome once quota is settled; lets finalisation close spend without re-deciding quota. */
  outcomeStatus: AnalysisStatus | null;
  reservedAmount: number;
  actualAmount: number | null;
  createdAt: number;
  leaseExpiresAt: number;
  settledAt: number | null;
}

export interface SettleResult {
  analysisStatus: AnalysisStatus;
  /** Provider charge actually incurred (may exist even when quota is released). */
  actualSpend?: number | null;
}

export interface DeleteCounts {
  checks: number;
  history: number;
  feedback: number;
  /** Direction (c): the subject's user-linked quota buckets removed. */
  quotaBuckets: number;
  /** Direction (c): the subject's reservations removed after resolution. */
  reservations: number;
}

/** A stored dashboard event: the 0.1.0-draft eight-field shape or the agreed 0.2.0-draft nine-field shape. */
export type StoredUsageEvent = CheckOutcomeEvent | CheckOutcomeEventV2;

export interface PersistencePort {
  checks: {
    /** Atomic check + findings + optional history-row save; null for invalid input. */
    save(input: StoredCheckInput): StoredCheck | null;
    /** Own-row read only; expired or foreign rows return null. */
    getOwned(checkId: string, subjectKey: string, now: number): StoredCheck | null;
    /** Deletes the check with its findings, history and feedback rows. */
    deleteCheck(checkId: string, subjectKey: string): boolean;
    /** Physically removes expired checks and dependent rows; returns checks removed. */
    purgeExpired(now: number): number;
  };
  history: {
    /** Own-row listing, newest first, expired rows excluded. */
    listOwned(subjectKey: string, now: number): StoredHistoryEntry[];
  };
  feedback: {
    /** Idempotent upsert keyed by subject + check; null for invalid input. */
    save(input: FeedbackEntryInput): FeedbackEntry | null;
    listOwned(subjectKey: string): FeedbackEntry[];
  };
  events: {
    /** Idempotent append by event id; identical duplicate true, conflicting duplicate false. */
    append(event: StoredUsageEvent): boolean;
    /** Dashboard-side aggregate read; synthetic tests only in this slice. */
    listAll(): StoredUsageEvent[];
    /** Removes events whose occurred_at is before the given epoch ms. */
    purgeBefore(epochMs: number): number;
  };
  quota: {
    getOrCreateBucket(key: QuotaBucketKey & { periodEnd: number; limitCount?: number | null }, now: number): QuotaBucket;
    /**
     * Atomically reserves one unit on both quota buckets and optional budget capacity.
     * Refuses (null) when a limit is unconfigured (null) or would be exceeded.
     */
    reserve(input: QuotaReservationInput): ReservationRecord | null;
    /**
     * Converts or releases exactly once: completed counts + settles spend; limited and
     * unavailable release quota (a provider charge may still be settled).
     */
    settle(reservationId: string, result: SettleResult, now: number): boolean;
    /**
     * Records the outcome and settles quota now; only the provider spend stays open.
     * Keeps the spend reservation instead of blindly releasing it.
     */
    markReconciliationRequired(reservationId: string, status: AnalysisStatus, now: number): boolean;
    /** Closes a reconciliation's provider spend at a known amount; quota is already settled. */
    finalizeReconciliation(reservationId: string, actualSpend: number, now: number): boolean;
    reservationByRequestKey(requestKey: string): ReservationRecord | null;
    getBucket(key: QuotaBucketKey): QuotaBucket | null;
  };
  budget: {
    getBucket(key: BudgetBucketKey): BudgetBucket | null;
  };
  /**
   * Account deletion (direction (c)): resolves outstanding reservations/charges, then
   * removes the subject's checks/findings/history/feedback and user-linked quota
   * buckets/reservations. Non-user-linked budget totals are retained.
   */
  deleteSubject(subjectKey: string): DeleteCounts;
}

// ---- validation helpers ----

const isText = (value: unknown, max = 256): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isRiskLevel = (value: unknown): value is RiskLevel =>
  value === 'low' || value === 'suspicious' || value === 'high' || value === 'undetermined';
const isVerdictLabel = (value: unknown): value is VerdictLabel =>
  (DRAFT_VERDICT_LABELS as readonly string[]).includes(value as string);

function validHighlight(value: unknown): value is ReasonHighlight {
  if (typeof value !== 'object' || value === null) return false;
  const span = value as Record<string, unknown>;
  return Object.keys(span).length === 3
    && Number.isInteger(span.start) && (span.start as number) >= 0
    && Number.isInteger(span.end) && (span.end as number) > (span.start as number)
    && isText(span.excerpt, MAX_REASON_CHARS);
}

function normaliseHighlights(value: unknown): ReasonHighlight[] | null {
  if (!Array.isArray(value) || value.length > MAX_HIGHLIGHTS) return null;
  if (!value.every(validHighlight)) return null;
  return value.map(span => ({ start: span.start, end: span.end, excerpt: span.excerpt }));
}

function normaliseLimitations(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIMITATIONS) return null;
  if (!value.every(item => typeof item === 'string' && item.length <= MAX_REASON_CHARS)) return null;
  return [...value];
}

function normaliseFindings(value: unknown): StoredFindingInput[] | null {
  if (!Array.isArray(value)) return null;
  const findings: StoredFindingInput[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const finding = item as Record<string, unknown>;
    if (!isText(finding.ruleId, 64)) return null;
    if (!isText(finding.excerpt, 2_000)) return null;
    if (!Number.isInteger(finding.start) || (finding.start as number) < 0) return null;
    if (!Number.isInteger(finding.end) || (finding.end as number) <= (finding.start as number)) return null;
    if (finding.contextNote !== undefined && finding.contextNote !== null
      && !(typeof finding.contextNote === 'string' && finding.contextNote.length <= 1_000)) return null;
    findings.push({
      ruleId: finding.ruleId.trim(),
      excerpt: finding.excerpt,
      start: finding.start as number,
      end: finding.end as number,
      contextNote: finding.contextNote === undefined || finding.contextNote === null
        ? null
        : finding.contextNote as string,
    });
  }
  return findings;
}

function bucketKeyOf(key: QuotaBucketKey): string {
  return `${key.subjectKey}\u0000${key.periodKind}\u0000${key.periodStart}`;
}

// ---- in-memory adapter ----

/**
 * Create the in-memory persistence adapter. Suitable for tests and local drafts only; a
 * restart forgets everything and nothing here is cross-instance. The Supabase adapter must
 * implement `PersistencePort` after team approval.
 */
export function createInMemoryPersistence(): PersistencePort {
  const checks = new Map<string, StoredCheck>();
  const history = new Map<string, StoredHistoryEntry>();
  const feedback = new Map<string, FeedbackEntry>(); // key: subject \0 check
  const events = new Map<string, StoredUsageEvent>();
  const quotaBuckets = new Map<string, QuotaBucket>();
  const budgetBuckets = new Map<string, BudgetBucket>();
  const reservations = new Map<string, ReservationRecord>();
  const reservationByKey = new Map<string, string>();
  let nextId = 1;

  const feedbackKey = (subjectKey: string, checkId: string): string => `${subjectKey}\u0000${checkId}`;

  function removeDependents(checkId: string): void {
    for (const [id, entry] of history) if (entry.checkId === checkId) history.delete(id);
    for (const [key, entry] of feedback) if (entry.checkId === checkId) feedback.delete(key);
  }

  function save(input: StoredCheckInput): StoredCheck | null {
    if (!input || typeof input !== 'object') return null;
    if (!isText(input.checkId, 128) || /\s/.test(input.checkId)) return null;
    if (!isText(input.subjectKey, 128)) return null;
    if (!isText(input.planId, 32)) return null;
    if (!isFinitePositive(input.createdAt) || !isFinitePositive(input.expiresAt)) return null;
    if (input.expiresAt <= input.createdAt) return null;
    if (!isValidAnalysisPair(input.analysisStatus, input.analysisMode)) return null;
    if (!(CATEGORY_IDS as readonly string[]).includes(input.categoryId)) return null;
    if (!isText(input.taxonomyVersion, 32)) return null;
    if (input.verdictLabel !== null && !isVerdictLabel(input.verdictLabel)) return null;
    if (input.riskLevel !== null && !isRiskLevel(input.riskLevel)) return null;
    if (input.reason !== null) {
      if (typeof input.reason !== 'string' || input.reason.length > MAX_REASON_CHARS) return null;
    }
    const highlights = normaliseHighlights(input.reasonHighlights);
    if (highlights === null) return null;
    if (highlights.length > 0 && (input.reason === null || input.reason === '')) return null;
    const limitations = normaliseLimitations(input.limitations);
    if (limitations === null) return null;
    const findings = normaliseFindings(input.findings);
    if (findings === null) return null;
    if (checks.has(input.checkId)) return null; // identity is unique
    if (input.history) {
      const snippetRaw = input.history.snippet;
      if (typeof snippetRaw !== 'string') return null;
      const snippet = snippetRaw.trim();
      if (snippet.length === 0 || snippet.length > MAX_SNIPPET_CHARS) return null;
      if (!isVerdictLabel(input.history.verdictLabel)) return null;
    }

    const historyId = input.history ? `history-${nextId++}` : null;
    const check: StoredCheck = Object.freeze({
      checkId: input.checkId,
      subjectKey: input.subjectKey.trim(),
      planId: input.planId.trim().toLowerCase(),
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      analysisStatus: input.analysisStatus,
      analysisMode: input.analysisMode,
      categoryId: input.categoryId,
      taxonomyVersion: input.taxonomyVersion,
      verdictLabel: input.verdictLabel,
      riskLevel: input.riskLevel,
      reason: input.reason,
      reasonHighlights: highlights.map(span => ({ ...span })),
      limitations: [...limitations],
      findings: findings.map((finding) => Object.freeze({
        ...finding,
        id: `finding-${nextId++}`,
        checkId: input.checkId,
        start: finding.start,
        end: finding.end,
      })),
      historyId,
    });
    checks.set(check.checkId, check);
    if (input.history) {
      const entry: StoredHistoryEntry = Object.freeze({
        id: historyId!,
        checkId: check.checkId,
        subjectKey: check.subjectKey,
        planId: check.planId,
        createdAt: check.createdAt,
        expiresAt: check.expiresAt,
        snippet: input.history.snippet.trim(),
        verdictLabel: input.history.verdictLabel,
        category: check.categoryId,
      });
      history.set(entry.id, entry);
    }
    return copyCheck(check);
  }

  function copyCheck(check: StoredCheck): StoredCheck {
    return {
      ...check,
      reasonHighlights: check.reasonHighlights.map(span => ({ ...span })),
      limitations: [...check.limitations],
      findings: check.findings.map(finding => ({ ...finding })),
    };
  }

  function getOwned(checkId: string, subjectKey: string, now: number): StoredCheck | null {
    if (!isText(checkId, 128) || !isText(subjectKey, 128) || !Number.isFinite(now)) return null;
    const check = checks.get(checkId);
    if (!check || check.subjectKey !== subjectKey.trim()) return null;
    if (now >= check.expiresAt) return null;
    return copyCheck(check);
  }

  function deleteCheck(checkId: string, subjectKey: string): boolean {
    if (!isText(checkId, 128) || !isText(subjectKey, 128)) return false;
    const check = checks.get(checkId);
    if (!check || check.subjectKey !== subjectKey.trim()) return false;
    removeDependents(checkId);
    return checks.delete(checkId);
  }

  function purgeExpired(now: number): number {
    if (!Number.isFinite(now)) return 0;
    let removed = 0;
    for (const [checkId, check] of checks) {
      if (now >= check.expiresAt) {
        removeDependents(checkId);
        checks.delete(checkId);
        removed += 1;
      }
    }
    return removed;
  }

  function listHistory(subjectKey: string, now: number): StoredHistoryEntry[] {
    if (!isText(subjectKey, 128) || !Number.isFinite(now)) return [];
    const key = subjectKey.trim();
    return [...history.values()]
      .filter(entry => entry.subjectKey === key && now < entry.expiresAt)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map(entry => ({ ...entry }));
  }

  function saveFeedback(input: FeedbackEntryInput): FeedbackEntry | null {
    if (!input || typeof input !== 'object') return null;
    if (!isText(input.subjectKey, 128) || !isText(input.checkId, 128) || /\s/.test(input.checkId)) return null;
    if (!(CATEGORY_IDS as readonly string[]).includes(input.category)) return null;
    if (typeof input.reasonCode !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(input.reasonCode)) return null;
    if (!isFinitePositive(input.createdAt)) return null;
    // One feedback row per owned check: the check must exist and belong to the subject.
    const check = checks.get(input.checkId);
    if (!check || check.subjectKey !== input.subjectKey.trim()) return null;
    const key = feedbackKey(check.subjectKey, check.checkId);
    const existing = feedback.get(key);
    const entry: FeedbackEntry = Object.freeze({
      id: existing?.id ?? `feedback-${nextId++}`,
      trigger: 'wrong_result',
      subjectKey: check.subjectKey,
      checkId: check.checkId,
      category: input.category,
      reasonCode: input.reasonCode,
      createdAt: input.createdAt,
    });
    feedback.set(key, entry);
    return { ...entry };
  }

  function listFeedback(subjectKey: string): FeedbackEntry[] {
    if (!isText(subjectKey, 128)) return [];
    const key = subjectKey.trim();
    return [...feedback.values()]
      .filter(entry => entry.subjectKey === key)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map(entry => ({ ...entry }));
  }

  function appendEvent(event: StoredUsageEvent): boolean {
    if (!event || typeof event !== 'object') return false;
    // Both agreed shapes are storable: 0.1.0-draft (eight fields) and 0.2.0-draft (nine, with
    // the agreed subject_ref). Validate with the matching validator; never store an invalid event.
    const isV2 = event.contract_version === EVENT_CONTRACT_VERSION_V2;
    if (isV2 ? !validateCheckOutcomeEventV2(event) : !validateCheckOutcomeEvent(event)) return false;
    const existing = events.get(event.event_id);
    if (existing) return JSON.stringify(existing) === JSON.stringify(event);
    const base = {
      contract_version: event.contract_version,
      event_type: event.event_type,
      event_id: event.event_id,
      occurred_at: event.occurred_at,
      taxonomy_version: event.taxonomy_version,
      category_id: event.category_id,
      analysis_status: event.analysis_status,
      analysis_mode: event.analysis_mode,
    };
    const clean: StoredUsageEvent = isV2
      ? Object.freeze({ ...base, subject_ref: (event as CheckOutcomeEventV2).subject_ref })
      : Object.freeze(base);
    events.set(event.event_id, clean);
    return true;
  }

  function purgeEventsBefore(epochMs: number): number {
    if (!Number.isFinite(epochMs)) return 0;
    let removed = 0;
    for (const [eventId, event] of events) {
      const occurred = Date.parse(event.occurred_at);
      if (Number.isFinite(occurred) && occurred < epochMs) {
        events.delete(eventId);
        removed += 1;
      }
    }
    return removed;
  }

  function getOrCreateQuotaBucket(
    key: QuotaBucketKey & { periodEnd: number; limitCount?: number | null },
    now: number,
  ): QuotaBucket {
    const id = bucketKeyOf(key);
    const existing = quotaBuckets.get(id);
    if (existing) return { ...existing };
    const bucket: QuotaBucket = {
      id: `quota-${nextId++}`,
      subjectKey: key.subjectKey.trim(),
      periodKind: key.periodKind,
      periodStart: key.periodStart,
      periodEnd: key.periodEnd,
      limitCount: key.limitCount ?? null,
      completedCount: 0,
      reservedCount: 0,
      updatedAt: now,
    };
    quotaBuckets.set(id, bucket);
    return { ...bucket };
  }

  function findQuotaBucket(key: QuotaBucketKey): QuotaBucket | null {
    const bucket = quotaBuckets.get(bucketKeyOf(key));
    return bucket ? { ...bucket } : null;
  }

  function getOrCreateBudgetBucket(input: NonNullable<QuotaReservationInput['budget']>, now: number): BudgetBucket {
    const id = `${input.bucket.budgetKey}\u0000${input.bucket.periodStart}`;
    const existing = budgetBuckets.get(id);
    if (existing) return { ...existing };
    const bucket: BudgetBucket = {
      id: `budget-${nextId++}`,
      budgetKey: input.bucket.budgetKey,
      periodStart: input.bucket.periodStart,
      periodEnd: input.periodEnd,
      currency: input.currency,
      limitAmount: input.limitAmount,
      reservedAmount: 0,
      spentAmount: 0,
      updatedAt: now,
    };
    budgetBuckets.set(id, bucket);
    return { ...bucket };
  }

  function reserve(input: QuotaReservationInput): ReservationRecord | null {
    if (!input || typeof input !== 'object') return null;
    if (!isText(input.subjectKey, 128) || !isText(input.requestKey, 128)) return null;
    if (!isFinitePositive(input.now) || !isFinitePositive(input.leaseMs)) return null;
    if (!isFinitePositive(input.dailyBucket.periodStart) || !isFinitePositive(input.allowanceBucket.periodStart)) return null;
    // NULL limit = unconfigured: refuse admission, never treat it as unlimited.
    const dailyLimit = input.dailyBucket.limit;
    const allowanceLimit = input.allowanceBucket.limit;
    if (dailyLimit === null || allowanceLimit === null
      || !isNonNegative(dailyLimit) || !isNonNegative(allowanceLimit)) return null;
    const existingId = reservationByKey.get(input.requestKey);
    if (existingId) {
      const existing = reservations.get(existingId);
      return existing ? { ...existing } : null; // idempotent replay of the same request
    }
    if (input.budget && (!isNonNegative(input.budget.reservedAmount) || !isFinitePositive(input.budget.limitAmount))) {
      return null;
    }

    const daily = getOrCreateQuotaBucket(
      { ...input.dailyBucket, subjectKey: input.subjectKey, limitCount: dailyLimit },
      input.now,
    );
    const allowance = getOrCreateQuotaBucket(
      { ...input.allowanceBucket, subjectKey: input.subjectKey, limitCount: allowanceLimit },
      input.now,
    );
    // The reservation is the atomic unit: both quota buckets plus optional spend capacity.
    const dailyKey = bucketKeyOf({ ...input.dailyBucket, subjectKey: daily.subjectKey });
    const allowanceKey = bucketKeyOf({ ...input.allowanceBucket, subjectKey: allowance.subjectKey });
    const dailyStored = quotaBuckets.get(dailyKey)!;
    const allowanceStored = quotaBuckets.get(allowanceKey)!;
    if (dailyStored.id === allowanceStored.id) return null; // buckets must be distinct
    // Admission under the (single-threaded) bucket state: completed + reserved + 1 <= limit.
    if (dailyStored.completedCount + dailyStored.reservedCount + 1 > dailyLimit
      || allowanceStored.completedCount + allowanceStored.reservedCount + 1 > allowanceLimit) {
      return null;
    }
    dailyStored.limitCount = dailyLimit;
    allowanceStored.limitCount = allowanceLimit;
    dailyStored.reservedCount += 1;
    dailyStored.updatedAt = input.now;
    allowanceStored.reservedCount += 1;
    allowanceStored.updatedAt = input.now;

    let budgetBucketId: string | null = null;
    if (input.budget) {
      getOrCreateBudgetBucket(input.budget, input.now);
      const stored = budgetBuckets.get(`${input.budget.bucket.budgetKey}\u0000${input.budget.bucket.periodStart}`)!;
      if (stored.reservedAmount + input.budget.reservedAmount > stored.limitAmount) return null;
      stored.reservedAmount += input.budget.reservedAmount;
      stored.updatedAt = input.now;
      budgetBucketId = stored.id;
    }

    const reservation: ReservationRecord = {
      id: `reservation-${nextId++}`,
      requestKey: input.requestKey,
      subjectKey: input.subjectKey.trim(),
      dailyBucketId: dailyStored.id,
      allowanceBucketId: allowanceStored.id,
      budgetBucketId,
      state: 'reserved',
      outcomeStatus: null,
      reservedAmount: input.budget?.reservedAmount ?? 0,
      actualAmount: null,
      createdAt: input.now,
      leaseExpiresAt: input.now + input.leaseMs,
      settledAt: null,
    };
    reservations.set(reservation.id, reservation);
    reservationByKey.set(reservation.requestKey, reservation.id);
    return { ...reservation };
  }

  function settle(reservationId: string, result: SettleResult, now: number): boolean {
    const reservation = reservations.get(reservationId);
    if (!reservation || reservation.state !== 'reserved') return false; // exactly once
    const status = result?.analysisStatus;
    if (status !== 'completed' && status !== 'limited' && status !== 'unavailable') return false;
    if (!isFinitePositive(now)) return false;

    const daily = [...quotaBuckets.values()].find(bucket => bucket.id === reservation.dailyBucketId);
    const allowance = [...quotaBuckets.values()].find(bucket => bucket.id === reservation.allowanceBucketId);
    if (!daily || !allowance) return false;

    const completed = status === 'completed';
    const budget = reservation.budgetBucketId === null
      ? null
      : [...budgetBuckets.values()].find(bucket => bucket.id === reservation.budgetBucketId) ?? null;
    // Spend must be known before anything mutates: a completed analysis settles the reserved
    // amount by default; a limited/failed attempt settles only an explicitly reported charge,
    // otherwise the caller must use reconciliation (uncertain provider cost).
    const reportedSpend = result.actualSpend === undefined || result.actualSpend === null
      ? null
      : result.actualSpend;
    if (reportedSpend !== null && !isNonNegative(reportedSpend)) return false;
    if (!completed && budget !== null && reportedSpend === null) return false;
    if (daily.reservedCount < 1 || allowance.reservedCount < 1) return false; // inconsistent state

    // Only completed analyses consume quota; limited and unavailable release the unit.
    daily.reservedCount = Math.max(0, daily.reservedCount - 1);
    allowance.reservedCount = Math.max(0, allowance.reservedCount - 1);
    daily.updatedAt = now;
    allowance.updatedAt = now;
    if (completed) {
      daily.completedCount += 1;
      allowance.completedCount += 1;
    }

    if (budget !== null) {
      const spend = reportedSpend ?? reservation.reservedAmount;
      budget.reservedAmount = Math.max(0, budget.reservedAmount - reservation.reservedAmount);
      budget.spentAmount += spend;
      budget.updatedAt = now;
      reservation.actualAmount = spend;
    }

    reservation.state = completed ? 'completed' : 'released';
    reservation.outcomeStatus = status;
    reservation.settledAt = now;
    return true;
  }

  function markReconciliationRequired(reservationId: string, status: AnalysisStatus, now: number): boolean {
    const reservation = reservations.get(reservationId);
    if (!reservation || reservation.state !== 'reserved') return false;
    if (status !== 'completed' && status !== 'limited' && status !== 'unavailable') return false;
    if (!isFinitePositive(now)) return false;
    const daily = [...quotaBuckets.values()].find(bucket => bucket.id === reservation.dailyBucketId);
    const allowance = [...quotaBuckets.values()].find(bucket => bucket.id === reservation.allowanceBucketId);
    if (!daily || !allowance || daily.reservedCount < 1 || allowance.reservedCount < 1) return false;
    // The outcome is known, so quota is settled now; only the provider spend stays open.
    daily.reservedCount = Math.max(0, daily.reservedCount - 1);
    allowance.reservedCount = Math.max(0, allowance.reservedCount - 1);
    daily.updatedAt = now;
    allowance.updatedAt = now;
    if (status === 'completed') {
      daily.completedCount += 1;
      allowance.completedCount += 1;
    }
    reservation.state = 'reconciliation_required';
    reservation.outcomeStatus = status;
    reservation.settledAt = now;
    return true;
  }

  function finalizeReconciliation(reservationId: string, actualSpend: number, now: number): boolean {
    const reservation = reservations.get(reservationId);
    if (!reservation || reservation.state !== 'reconciliation_required' || reservation.outcomeStatus === null) return false;
    if (!isNonNegative(actualSpend) || !isFinitePositive(now)) return false;
    if (reservation.budgetBucketId !== null) {
      const budget = [...budgetBuckets.values()].find(bucket => bucket.id === reservation.budgetBucketId);
      if (!budget) return false;
      budget.reservedAmount = Math.max(0, budget.reservedAmount - reservation.reservedAmount);
      budget.spentAmount += actualSpend;
      budget.updatedAt = now;
      reservation.actualAmount = actualSpend;
    }
    reservation.state = reservation.outcomeStatus === 'completed' ? 'completed' : 'released';
    reservation.settledAt = now;
    return true;
  }

  function reservationByRequestKey(requestKey: string): ReservationRecord | null {
    const id = reservationByKey.get(requestKey);
    if (id === undefined) return null;
    const reservation = reservations.get(id);
    return reservation ? { ...reservation } : null;
  }

  function getBudgetBucket(key: BudgetBucketKey): BudgetBucket | null {
    const bucket = budgetBuckets.get(`${key.budgetKey}\u0000${key.periodStart}`);
    return bucket ? { ...bucket } : null;
  }

  function deleteSubject(subjectKey: string): DeleteCounts {
    const key = subjectKey?.trim();
    const empty: DeleteCounts = { checks: 0, history: 0, feedback: 0, quotaBuckets: 0, reservations: 0 };
    if (!isText(key, 128)) return empty;
    let checkCount = 0;
    let historyCount = 0;
    let feedbackCount = 0;

    // Direction (c): resolve outstanding reservations/charges before removing their
    // accounting links. An unresolved charge is settled conservatively at its reserved
    // amount so spend is never under-counted; quota units are released.
    let reservationCount = 0;
    for (const [id, reservation] of reservations) {
      if (reservation.subjectKey !== key) continue;
      if (reservation.state === 'reserved') {
        for (const bucket of quotaBuckets.values()) {
          if (bucket.id === reservation.dailyBucketId || bucket.id === reservation.allowanceBucketId) {
            bucket.reservedCount = Math.max(0, bucket.reservedCount - 1);
          }
        }
        if (reservation.budgetBucketId !== null) {
          const budget = [...budgetBuckets.values()].find(b => b.id === reservation.budgetBucketId);
          if (budget) {
            budget.reservedAmount = Math.max(0, budget.reservedAmount - reservation.reservedAmount);
            budget.spentAmount += reservation.reservedAmount;
          }
        }
      } else if (reservation.state === 'reconciliation_required' && reservation.budgetBucketId !== null) {
        const budget = [...budgetBuckets.values()].find(b => b.id === reservation.budgetBucketId);
        if (budget) {
          budget.reservedAmount = Math.max(0, budget.reservedAmount - reservation.reservedAmount);
          budget.spentAmount += reservation.reservedAmount;
        }
      }
      reservations.delete(id);
      reservationByKey.delete(reservation.requestKey);
      reservationCount += 1;
    }
    // Remove the subject's user-linked quota buckets; non-user-linked budget totals stay.
    let bucketCount = 0;
    for (const [id, bucket] of quotaBuckets) {
      if (bucket.subjectKey === key) {
        quotaBuckets.delete(id);
        bucketCount += 1;
      }
    }

    for (const [checkId, check] of checks) {
      if (check.subjectKey === key) {
        // Count dependents before cascading so the caller sees what was removed.
        for (const entry of history.values()) if (entry.checkId === checkId) historyCount += 1;
        for (const entry of feedback.values()) if (entry.checkId === checkId) feedbackCount += 1;
        removeDependents(checkId);
        checks.delete(checkId);
        checkCount += 1;
      }
    }
    // Orphan rows (none expected) are still removed by owner.
    for (const [id, entry] of history) {
      if (entry.subjectKey === key) {
        history.delete(id);
        historyCount += 1;
      }
    }
    for (const [feedbackId, entry] of feedback) {
      if (entry.subjectKey === key) {
        feedback.delete(feedbackId);
        feedbackCount += 1;
      }
    }
    return {
      checks: checkCount, history: historyCount, feedback: feedbackCount,
      quotaBuckets: bucketCount, reservations: reservationCount,
    };
  }

  return {
    checks: { save, getOwned, deleteCheck, purgeExpired },
    history: { listOwned: listHistory },
    feedback: { save: saveFeedback, listOwned: listFeedback },
    events: { append: appendEvent, listAll: () => [...events.values()].map(event => ({ ...event }) as StoredUsageEvent), purgeBefore: purgeEventsBefore },
    quota: {
      getOrCreateBucket: (key, now) => getOrCreateQuotaBucket(key, now),
      reserve,
      settle,
      markReconciliationRequired,
      finalizeReconciliation,
      reservationByRequestKey,
      getBucket: findQuotaBucket,
    },
    budget: { getBucket: getBudgetBucket },
    deleteSubject,
  };
}
