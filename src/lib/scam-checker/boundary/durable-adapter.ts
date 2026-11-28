/**
 * M4 — durable persistence adapter: the live implementation of `DurablePersistence`.
 *
 * This is the module the 23 November plan calls Phase 5. It performs no I/O of its own: every
 * call becomes a `PostgrestRequest` on an injected `PostgrestTransport`, so the whole contract
 * can be exercised against a double before any database exists. The live wiring is
 * `createFetchTransport` (see `postgrest-client.ts`).
 *
 * WHAT IT CALLS — exactly the reviewed draft migration (0001 rev 5 / 0002 rev 5, merged as
 * PR #52):
 *   - seven transaction functions, named through `M4_TRANSACTION_FUNCTIONS` so this file, the
 *     SQL drafts and the contract cannot drift;
 *   - plain PostgREST reads/writes for the paths 0002 does not wrap (own-row reads, feedback
 *     upsert, event append, bucket reads).
 * The table and column names below are pinned by a test that reads `design/…-0001-draft.sql`
 * and `…-0002-functions-draft.sql`, so a rename in either place fails the suite.
 *
 * PRECONDITIONS THE CALLER OWNS (not enforced here, by design): the subject key is
 * server-derived after M2 session/entitlement verification, ownership was already checked, and
 * the input passed boundary validation. This module never trusts browser input of its own.
 *
 * NOT APPLIED ANYWHERE: no database object exists yet; `deleteSubject`, the quota/budget paths
 * and every read above stay unverified against a live project until Phase 3 lands.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import {
  M4_TRANSACTION_FUNCTIONS, type DurablePersistence,
} from './durable-persistence.ts';
import type {
  BudgetBucket, DeleteCounts, QuotaBucket,
  QuotaReservationInput, ReservationRecord, SettleResult, StoredCheck, StoredCheckInput,
  StoredHistoryEntry, StoredUsageEvent,
} from './persistence-port.ts';
import type { PostgrestTransport } from './postgrest-client.ts';
import { PostgrestError } from './postgrest-client.ts';
import {
  MAX_REASON_CHARS, type AnalysisMode, type AnalysisStatus, type ReasonHighlight,
  type RiskLevel, type VerdictLabel,
} from './check-boundary.ts';
import { CATEGORY_IDS, type CategoryId } from './taxonomy.ts';
import { MAX_SNIPPET_CHARS, type HistoryEntry } from './history-store.ts';
import type { FeedbackEntry, FeedbackEntryInput, FeedbackTrigger } from './feedback-store.ts';
import {
  EVENT_CONTRACT_VERSION_V2, validateCheckOutcomeEvent, validateCheckOutcomeEventV2,
  type CheckOutcomeEvent, type CheckOutcomeEventV2,
} from './x13-event.ts';

/**
 * Table names as written in 0001. Pinned here so a rename in the SQL is a failing test, not a
 * silent 404 at runtime.
 */
export const M4_TABLES = Object.freeze({
  checks: 'scam_checks',
  findings: 'scam_findings',
  history: 'checker_history',
  feedback: 'checker_feedback',
  events: 'checker_usage_events',
  quotaBuckets: 'checker_quota_buckets',
  budgetBuckets: 'checker_budget_buckets',
  reservations: 'checker_usage_reservations',
});

/** Columns read back for a stored check. Explicit so a dropped column fails loudly. */
const CHECK_COLUMNS = [
  'id', 'user_id', 'plan_id', 'created_at', 'expires_at', 'analysis_status', 'analysis_mode',
  'category_id', 'taxonomy_version', 'verdict_label', 'risk_level', 'reason',
  'reason_highlights', 'limitations',
].join(',');

const FINDING_COLUMNS = 'id,check_id,rule_id,excerpt,start_offset,end_offset,context_note';
const HISTORY_COLUMNS = 'id,check_id,user_id,plan_id,created_at,expires_at,snippet,verdict_label,category_id';
const FEEDBACK_COLUMNS = 'id,user_id,check_id,category_id,reason_code,trigger,created_at';
const EVENT_COLUMNS = 'event_id,contract_version,event_type,occurred_at,taxonomy_version,category_id,analysis_status,analysis_mode,subject_ref';
const QUOTA_COLUMNS = 'id,subject_key,period_kind,period_start,period_end,limit_count,completed_count,reserved_count,updated_at';
const BUDGET_COLUMNS = 'id,budget_key,period_start,period_end,currency,limit_amount,reserved_amount,spent_amount,updated_at';
const RESERVATION_COLUMNS = [
  'id', 'request_key', 'subject_key', 'daily_bucket_id', 'allowance_bucket_id', 'budget_bucket_id',
  'state', 'outcome_status', 'reserved_amount', 'actual_amount', 'created_at', 'lease_expires_at',
  'settled_at',
].join(',');

const REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERDICT_LABELS = [
  'suspicious', 'potentially suspicious', 'no obvious indicators', 'high risk', 'undetermined',
] as const;
const RISK_LEVELS = ['low', 'suspicious', 'high', 'undetermined'] as const;

type Row = Record<string, unknown>;

export interface DurableAdapterOptions {
  /**
   * Clock used only for the operations whose interface carries no instant (`deleteSubject`).
   * Everything else takes the caller's `now`, so tests stay deterministic.
   */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Value mapping: contract (camelCase, epoch ms) <-> rows (snake_case, timestamptz)
// ---------------------------------------------------------------------------

const toIso = (epochMs: number): string => new Date(epochMs).toISOString();

function fromIso(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error('durable store: a timestamp column could not be parsed');
  }
  return parsed;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `p_check` payload for `m4_save_check`; mirrors the columns 0002 reads with `->>`/`->`. */
export function toCheckPayload(input: StoredCheckInput): Row {
  return {
    id: input.checkId,
    user_id: input.subjectKey.trim(),
    plan_id: input.planId.trim().toLowerCase(),
    created_at: toIso(input.createdAt),
    expires_at: toIso(input.expiresAt),
    analysis_status: input.analysisStatus,
    analysis_mode: input.analysisMode,
    category_id: input.categoryId,
    taxonomy_version: input.taxonomyVersion,
    verdict_label: input.verdictLabel,
    risk_level: input.riskLevel,
    reason: input.reason,
    // 0001 validates: array of <=4 {start,end,excerpt} objects, end > start, non-empty excerpt.
    reason_highlights: input.reasonHighlights.map((span) => ({
      start: span.start, end: span.end, excerpt: span.excerpt,
    })),
    limitations: [...input.limitations],
  };
}

/** `p_findings` payload; 0002 reads exactly these keys. */
export function toFindingsPayload(input: StoredCheckInput): Row[] {
  return input.findings.map((finding) => ({
    rule_id: finding.ruleId,
    excerpt: finding.excerpt,
    start_offset: finding.start,
    end_offset: finding.end,
    context_note: finding.contextNote ?? null,
  }));
}

/**
 * `p_history` payload. The id is deliberately omitted: 0002 falls back to
 * `gen_random_uuid()`, and the row's metadata is copied from its parent check by the function.
 */
export function toHistoryPayload(input: StoredCheckInput): Row | null {
  if (!input.history) return null;
  return { snippet: input.history.snippet.trim(), verdict_label: input.history.verdictLabel };
}

function fromFindingRow(row: Row): StoredCheck['findings'][number] {
  return {
    id: String(row.id),
    checkId: String(row.check_id),
    ruleId: String(row.rule_id),
    excerpt: String(row.excerpt),
    start: asNumber(row.start_offset),
    end: asNumber(row.end_offset),
    contextNote: asText(row.context_note),
  };
}

function fromCheckRow(row: Row, findings: StoredCheck['findings'], historyId: string | null): StoredCheck {
  const highlights = Array.isArray(row.reason_highlights) ? row.reason_highlights : [];
  const limitations = Array.isArray(row.limitations) ? row.limitations : [];
  return {
    checkId: String(row.id),
    subjectKey: String(row.user_id),
    planId: String(row.plan_id),
    createdAt: fromIso(row.created_at),
    expiresAt: fromIso(row.expires_at),
    analysisStatus: String(row.analysis_status) as AnalysisStatus,
    analysisMode: String(row.analysis_mode) as AnalysisMode,
    categoryId: String(row.category_id) as CategoryId,
    taxonomyVersion: String(row.taxonomy_version),
    verdictLabel: (asText(row.verdict_label) ?? null) as VerdictLabel | null,
    riskLevel: (asText(row.risk_level) ?? null) as RiskLevel | null,
    reason: asText(row.reason),
    reasonHighlights: highlights.map((span): ReasonHighlight => {
      const record = span as Row;
      return {
        start: asNumber(record.start),
        end: asNumber(record.end),
        excerpt: String(record.excerpt ?? ''),
      };
    }),
    limitations: limitations.map((entry) => String(entry)),
    findings,
    historyId,
  };
}

function fromHistoryRow(row: Row): StoredHistoryEntry {
  return {
    id: String(row.id),
    checkId: String(row.check_id),
    subjectKey: String(row.user_id),
    planId: String(row.plan_id),
    createdAt: fromIso(row.created_at),
    expiresAt: fromIso(row.expires_at),
    snippet: String(row.snippet),
    verdictLabel: String(row.verdict_label) as VerdictLabel,
    category: String(row.category_id) as CategoryId,
  };
}

function fromFeedbackRow(row: Row): FeedbackEntry {
  return {
    id: String(row.id),
    subjectKey: String(row.user_id),
    checkId: String(row.check_id),
    category: String(row.category_id) as CategoryId,
    reasonCode: String(row.reason_code),
    trigger: String(row.trigger) as FeedbackTrigger,
    createdAt: fromIso(row.created_at),
  };
}

function fromEventRow(row: Row): StoredUsageEvent {
  const base: CheckOutcomeEvent = {
    contract_version: String(row.contract_version),
    event_type: String(row.event_type),
    event_id: String(row.event_id),
    // Normalised to RFC-3339 UTC so the agreed shape never carries a `+00:00` local form.
    occurred_at: toIso(fromIso(row.occurred_at)),
    taxonomy_version: String(row.taxonomy_version),
    category_id: String(row.category_id) as CategoryId,
    analysis_status: String(row.analysis_status) as AnalysisStatus,
    analysis_mode: String(row.analysis_mode) as AnalysisMode,
  };
  // `subject_ref` exists only after migration 0003 and only on 0.2.0-draft rows;
  // legacy 0.1.0-draft rows are returned as the eight-field shape.
  const subjectRef = row.subject_ref;
  if (base.contract_version === EVENT_CONTRACT_VERSION_V2
      && typeof subjectRef === 'string' && subjectRef.length > 0) {
    return { ...base, subject_ref: subjectRef } satisfies CheckOutcomeEventV2;
  }
  return base;
}

function fromQuotaRow(row: Row): QuotaBucket {
  return {
    id: String(row.id),
    subjectKey: String(row.subject_key),
    periodKind: String(row.period_kind) as QuotaBucket['periodKind'],
    periodStart: fromIso(row.period_start),
    periodEnd: fromIso(row.period_end),
    limitCount: asNumberOrNull(row.limit_count),
    completedCount: asNumber(row.completed_count),
    reservedCount: asNumber(row.reserved_count),
    updatedAt: fromIso(row.updated_at),
  };
}

function fromBudgetRow(row: Row): BudgetBucket {
  return {
    id: String(row.id),
    budgetKey: String(row.budget_key),
    periodStart: fromIso(row.period_start),
    periodEnd: fromIso(row.period_end),
    currency: String(row.currency),
    limitAmount: asNumber(row.limit_amount),
    reservedAmount: asNumber(row.reserved_amount),
    spentAmount: asNumber(row.spent_amount),
    updatedAt: fromIso(row.updated_at),
  };
}

function fromReservationRow(row: Row): ReservationRecord {
  return {
    id: String(row.id),
    requestKey: String(row.request_key),
    subjectKey: String(row.subject_key),
    dailyBucketId: String(row.daily_bucket_id),
    allowanceBucketId: String(row.allowance_bucket_id),
    budgetBucketId: asText(row.budget_bucket_id),
    state: String(row.state) as ReservationRecord['state'],
    outcomeStatus: (asText(row.outcome_status) ?? null) as AnalysisStatus | null,
    reservedAmount: asNumber(row.reserved_amount),
    actualAmount: asNumberOrNull(row.actual_amount),
    createdAt: fromIso(row.created_at),
    leaseExpiresAt: fromIso(row.lease_expires_at),
    settledAt: row.settled_at === null || row.settled_at === undefined ? null : fromIso(row.settled_at),
  };
}

// ---------------------------------------------------------------------------
// Input guards — narrow copies of the port's rules, so the adapter never sends something the
// database would reject with a 400 that reads like an application bug.
// ---------------------------------------------------------------------------

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function validCheckInput(input: StoredCheckInput): boolean {
  if (!input || typeof input !== 'object') return false;
  if (!isText(input.checkId, 128) || /\s/.test(input.checkId)) return false;
  if (!isText(input.subjectKey, 128)) return false;
  if (!isText(input.planId, 32)) return false;
  if (!Number.isFinite(input.createdAt) || !Number.isFinite(input.expiresAt)) return false;
  if (input.expiresAt <= input.createdAt) return false;
  if (!isText(input.taxonomyVersion, 32)) return false;
  if (input.verdictLabel !== null && !(VERDICT_LABELS as readonly string[]).includes(input.verdictLabel)) return false;
  if (input.riskLevel !== null && !(RISK_LEVELS as readonly string[]).includes(input.riskLevel)) return false;
  if (input.reason !== null && (typeof input.reason !== 'string' || input.reason.length > MAX_REASON_CHARS)) return false;
  if (!Array.isArray(input.limitations)) return false;
  if (!Array.isArray(input.findings)) return false;
  for (const finding of input.findings) {
    if (!finding || !isText(finding.ruleId, 64)) return false;
    if (typeof finding.excerpt !== 'string' || finding.excerpt.length === 0) return false;
    if (!Number.isInteger(finding.start) || !Number.isInteger(finding.end)) return false;
    if (finding.start < 0 || finding.end <= finding.start) return false;
  }
  if (input.history) {
    const snippet = typeof input.history.snippet === 'string' ? input.history.snippet.trim() : '';
    if (snippet.length === 0 || snippet.length > MAX_SNIPPET_CHARS) return false;
    if (!(VERDICT_LABELS as readonly string[]).includes(input.history.verdictLabel)) return false;
  }
  return true;
}

function validFeedbackInput(input: FeedbackEntryInput): boolean {
  if (!input || typeof input !== 'object') return false;
  if (!isText(input.subjectKey, 128) || !isText(input.checkId, 128)) return false;
  if (!(CATEGORY_IDS as readonly string[]).includes(input.category)) return false;
  if (typeof input.reasonCode !== 'string' || !REASON_CODE.test(input.reasonCode)) return false;
  return Number.isFinite(input.createdAt);
}

function sameEvent(a: StoredUsageEvent, b: StoredUsageEvent): boolean {
  const sameBase = a.contract_version === b.contract_version
    && a.event_type === b.event_type
    && a.event_id === b.event_id
    && Date.parse(a.occurred_at) === Date.parse(b.occurred_at)
    && a.taxonomy_version === b.taxonomy_version
    && a.category_id === b.category_id
    && a.analysis_status === b.analysis_status
    && a.analysis_mode === b.analysis_mode;
  if (!sameBase) return false;
  // A 0.2.0-draft replay must match on the reference too, or it is a conflict.
  const aRef = 'subject_ref' in a ? a.subject_ref : null;
  const bRef = 'subject_ref' in b ? b.subject_ref : null;
  return aRef === bRef;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

/**
 * Build the live `DurablePersistence` over an injected transport.
 *
 * The transport is the only capability required: no Supabase client, no key, no clock beyond
 * the optional `now` used for `deleteSubject`.
 */
export function createDurableAdapter(
  transport: PostgrestTransport,
  options: DurableAdapterOptions = {},
): DurablePersistence {
  if (!transport || typeof transport.request !== 'function') {
    throw new Error('createDurableAdapter requires a PostgrestTransport');
  }
  const clock = options.now ?? (() => Date.now());

  async function selectRows(path: string, query: Readonly<Record<string, string>>): Promise<Row[]> {
    const response = await transport.request({ method: 'GET', path, query });
    return Array.isArray(response.body) ? response.body as Row[] : [];
  }

  async function rpc(name: string, args: Row): Promise<unknown> {
    const response = await transport.request({ method: 'POST', path: `/rpc/${name}`, body: args });
    return response.body;
  }

  /** Read one check with its findings and history pointer. No expiry filter: this is a read-back. */
  async function readCheck(checkId: string, owner?: string, now?: number): Promise<StoredCheck | null> {
    const query: Record<string, string> = { id: `eq.${checkId}`, select: CHECK_COLUMNS };
    if (owner !== undefined) query.user_id = `eq.${owner}`;
    if (now !== undefined) query.expires_at = `gt.${toIso(now)}`;
    const rows = await selectRows(`/${M4_TABLES.checks}`, query);
    const row = rows[0];
    if (!row) return null;

    const findings = (await selectRows(`/${M4_TABLES.findings}`, {
      check_id: `eq.${checkId}`,
      select: FINDING_COLUMNS,
      order: 'start_offset.asc',
    })).map(fromFindingRow);

    const historyRows = await selectRows(`/${M4_TABLES.history}`, {
      check_id: `eq.${checkId}`,
      select: 'id',
    });
    const historyId = historyRows[0] ? String(historyRows[0].id) : null;
    return fromCheckRow(row, findings, historyId);
  }

  return {
    checks: {
      async save(input) {
        if (!validCheckInput(input)) return null;
        const id = await rpc(M4_TRANSACTION_FUNCTIONS.saveCheck, {
          p_check: toCheckPayload(input),
          p_findings: toFindingsPayload(input),
          p_history: toHistoryPayload(input),
        });
        // 0002 returns the check id, or NULL when it refused the input.
        if (typeof id !== 'string' || id.length === 0) return null;
        const stored = await readCheck(id);
        if (!stored) throw new Error('durable store: the saved check could not be read back');
        return stored;
      },

      async getOwned(checkId, subjectKey, now) {
        if (!isText(checkId, 128) || !isText(subjectKey, 128) || !Number.isFinite(now)) return null;
        return readCheck(checkId, subjectKey.trim(), now);
      },

      async deleteCheck(checkId, subjectKey) {
        if (!isText(checkId, 128) || !isText(subjectKey, 128)) return false;
        const response = await transport.request({
          method: 'DELETE',
          path: `/${M4_TABLES.checks}`,
          query: { id: `eq.${checkId}`, user_id: `eq.${subjectKey.trim()}` },
          prefer: ['return=representation'],
        });
        return Array.isArray(response.body) && response.body.length > 0;
      },

      async purgeExpired(now) {
        if (!Number.isFinite(now)) return 0;
        const removed = await rpc(M4_TRANSACTION_FUNCTIONS.purgeExpired, { p_now: toIso(now) });
        return asNumber(removed);
      },
    },

    history: {
      async listOwned(subjectKey, now) {
        if (!isText(subjectKey, 128) || !Number.isFinite(now)) return [];
        const rows = await selectRows(`/${M4_TABLES.history}`, {
          user_id: `eq.${subjectKey.trim()}`,
          expires_at: `gt.${toIso(now)}`,
          select: HISTORY_COLUMNS,
          order: 'created_at.desc',
        });
        return rows.map(fromHistoryRow);
      },
    },

    feedback: {
      async save(input) {
        if (!validFeedbackInput(input)) return null;
        const row: Row = {
          user_id: input.subjectKey.trim(),
          check_id: input.checkId,
          category_id: input.category,
          reason_code: input.reasonCode,
          trigger: 'wrong_result',
          created_at: toIso(input.createdAt),
        };
        const response = await transport.request({
          method: 'POST',
          path: `/${M4_TABLES.feedback}`,
          query: { on_conflict: 'user_id,check_id', select: FEEDBACK_COLUMNS },
          body: row,
          // One feedback row per (subject, check): a repeat is a no-op that returns the row.
          prefer: ['resolution=merge-duplicates', 'return=representation'],
        });
        const rows = Array.isArray(response.body) ? response.body as Row[] : [];
        return rows[0] ? fromFeedbackRow(rows[0]) : null;
      },

      async listOwned(subjectKey) {
        if (!isText(subjectKey, 128)) return [];
        const rows = await selectRows(`/${M4_TABLES.feedback}`, {
          user_id: `eq.${subjectKey.trim()}`,
          select: FEEDBACK_COLUMNS,
          order: 'created_at.desc',
        });
        return rows.map(fromFeedbackRow);
      },
    },

    events: {
      async append(event) {
        if (!event || typeof event !== 'object') return false;
        // Both agreed shapes are storable: 0.1.0-draft (eight fields) and 0.2.0-draft
        // (nine, with the required subject_ref). Migration 0003 was applied and verified
        // on 24 Nov 2026, which is what makes the v2 branch valid; the matching validator
        // rejects an invalid or missing reference before anything is sent.
        const isV2 = event.contract_version === EVENT_CONTRACT_VERSION_V2;
        if (isV2 ? !validateCheckOutcomeEventV2(event) : !validateCheckOutcomeEvent(event)) return false;

        const existing = await selectRows(`/${M4_TABLES.events}`, {
          event_id: `eq.${event.event_id}`,
          select: EVENT_COLUMNS,
        });
        if (existing[0]) return sameEvent(fromEventRow(existing[0]), event);

        try {
          await transport.request({
            method: 'POST',
            path: `/${M4_TABLES.events}`,
            body: fromEventRow(event as unknown as Row),
            prefer: ['return=minimal'],
          });
          return true;
        } catch (error) {
          // A concurrent insert is the identical-duplicate case, not a failure: re-read and compare.
          if (error instanceof PostgrestError && error.status === 409) {
            const raced = await selectRows(`/${M4_TABLES.events}`, {
              event_id: `eq.${event.event_id}`,
              select: EVENT_COLUMNS,
            });
            return raced[0] ? sameEvent(fromEventRow(raced[0]), event) : false;
          }
          throw error;
        }
      },

      async listAll() {
        const rows = await selectRows(`/${M4_TABLES.events}`, {
          select: EVENT_COLUMNS,
          order: 'occurred_at.asc',
        });
        return rows.map(fromEventRow);
      },

      async purgeBefore(epochMs) {
        if (!Number.isFinite(epochMs)) return 0;
        // 0003's m4_purge_events(p_before) returns the number removed; NULL cutoff deletes nothing.
        const removed = await rpc(M4_TRANSACTION_FUNCTIONS.purgeEvents, { p_before: toIso(epochMs) });
        return asNumber(removed);
      },
    },

    quota: {
      async getOrCreateBucket(key, now) {
        if (!isText(key.subjectKey, 128) || !Number.isFinite(now)) {
          throw new Error('durable store: getOrCreateBucket needs a subject key and an instant');
        }
        const subject = key.subjectKey.trim();
        const find = (): Promise<Row[]> => selectRows(`/${M4_TABLES.quotaBuckets}`, {
          subject_key: `eq.${subject}`,
          period_kind: `eq.${key.periodKind}`,
          period_start: `eq.${toIso(key.periodStart)}`,
          select: QUOTA_COLUMNS,
        });
        const found = await find();
        if (found[0]) return fromQuotaRow(found[0]);

        const row: Row = {
          subject_key: subject,
          period_kind: key.periodKind,
          period_start: toIso(key.periodStart),
          period_end: toIso(key.periodEnd),
          // null is a real state: an unconfigured allowance, which `reserve` must refuse.
          limit_count: key.limitCount ?? null,
          completed_count: 0,
          reserved_count: 0,
          updated_at: toIso(now),
        };
        try {
          const response = await transport.request({
            method: 'POST',
            path: `/${M4_TABLES.quotaBuckets}`,
            query: { select: QUOTA_COLUMNS },
            body: row,
            prefer: ['return=representation'],
          });
          const created = Array.isArray(response.body) ? response.body as Row[] : [];
          if (created[0]) return fromQuotaRow(created[0]);
        } catch (error) {
          if (!(error instanceof PostgrestError && error.status === 409)) throw error;
        }
        const raced = await find();
        if (raced[0]) return fromQuotaRow(raced[0]);
        throw new Error('durable store: the quota bucket could not be created or read');
      },

      async reserve(input) {
        const quotes = toReserveArgs(input);
        if (quotes === null) return null;
        const result = await rpc(M4_TRANSACTION_FUNCTIONS.reserveCheck, quotes);
        // 0002 returns the reservation row (existing one on replay) or NULL on refusal.
        if (result === null || result === undefined) return null;
        return fromReservationRow(result as Row);
      },

      async settle(reservationId, result: SettleResult, now) {
        if (!UUID.test(reservationId ?? '') || !Number.isFinite(now)) return false;
        const settled = await rpc(M4_TRANSACTION_FUNCTIONS.settleReservation, {
          p_reservation_id: reservationId,
          p_status: result?.analysisStatus ?? null,
          p_actual_spend: result?.actualSpend ?? null,
          p_now: toIso(now),
        });
        return settled === true;
      },

      async markReconciliationRequired(reservationId, status: AnalysisStatus, now) {
        if (!UUID.test(reservationId ?? '') || !Number.isFinite(now)) return false;
        const marked = await rpc(M4_TRANSACTION_FUNCTIONS.markReconciliation, {
          p_reservation_id: reservationId,
          p_status: status,
          p_now: toIso(now),
        });
        return marked === true;
      },

      async finalizeReconciliation(reservationId, actualSpend, now) {
        if (!UUID.test(reservationId ?? '') || !Number.isFinite(now)) return false;
        if (!Number.isFinite(actualSpend) || actualSpend < 0) return false;
        const closed = await rpc(M4_TRANSACTION_FUNCTIONS.finalizeReconciliation, {
          p_reservation_id: reservationId,
          p_actual_spend: actualSpend,
          p_now: toIso(now),
        });
        return closed === true;
      },

      async reservationByRequestKey(requestKey) {
        if (!isText(requestKey, 128)) return null;
        const rows = await selectRows(`/${M4_TABLES.reservations}`, {
          request_key: `eq.${requestKey}`,
          select: RESERVATION_COLUMNS,
        });
        return rows[0] ? fromReservationRow(rows[0]) : null;
      },

      async getBucket(key) {
        const rows = await selectRows(`/${M4_TABLES.quotaBuckets}`, {
          subject_key: `eq.${key.subjectKey.trim()}`,
          period_kind: `eq.${key.periodKind}`,
          period_start: `eq.${toIso(key.periodStart)}`,
          select: QUOTA_COLUMNS,
        });
        return rows[0] ? fromQuotaRow(rows[0]) : null;
      },

      async latestBucket(key) {
        // One row, newest period first: an anchored (first-use) window must be CONTINUED, not
        // restarted, so the caller needs the stored period_start it cannot derive from the clock.
        if (typeof key?.subjectKey !== 'string' || key.subjectKey.trim().length === 0) return null;
        const rows = await selectRows(`/${M4_TABLES.quotaBuckets}`, {
          subject_key: `eq.${key.subjectKey.trim()}`,
          period_kind: `eq.${key.periodKind}`,
          select: QUOTA_COLUMNS,
          order: 'period_start.desc',
          limit: '1',
        });
        return rows[0] ? fromQuotaRow(rows[0]) : null;
      },
    },

    budget: {
      async getBucket(key) {
        const rows = await selectRows(`/${M4_TABLES.budgetBuckets}`, {
          budget_key: `eq.${key.budgetKey}`,
          period_start: `eq.${toIso(key.periodStart)}`,
          select: BUDGET_COLUMNS,
        });
        return rows[0] ? fromBudgetRow(rows[0]) : null;
      },
    },

    async deleteSubject(subjectKey) {
      // Direction (c): the function resolves outstanding charges, then removes the subject's
      // rows; non-user-linked budget totals stay. `subject_key` is the M2 user uuid as text.
      if (typeof subjectKey !== 'string' || !UUID.test(subjectKey.trim())) {
        throw new Error('durable store: deleteSubject needs the verified M2 user uuid');
      }
      const counts = await rpc(M4_TRANSACTION_FUNCTIONS.deleteSubject, {
        p_user: subjectKey.trim(),
        p_now: toIso(clock()),
      });
      const record = typeof counts === 'object' && counts !== null ? counts as Row : {};
      return {
        checks: asNumber(record.checks),
        history: asNumber(record.history),
        feedback: asNumber(record.feedback),
        quotaBuckets: asNumber(record.quota_buckets),
        reservations: asNumber(record.reservations),
        events: asNumber(record.events),
      } satisfies DeleteCounts;
    },
  };
}

/**
 * `m4_reserve_check` arguments. Returns null when the input cannot be expressed safely — the
 * adapter refuses locally rather than sending a half-formed reservation that the function would
 * have to guess about.
 */
function toReserveArgs(input: QuotaReservationInput): Row | null {
  if (!input || typeof input !== 'object') return null;
  if (!isText(input.subjectKey, 128) || !isText(input.requestKey, 128)) return null;
  if (!Number.isFinite(input.now) || !Number.isFinite(input.leaseMs) || input.leaseMs <= 0) return null;
  const { dailyBucket, allowanceBucket } = input;
  if (!dailyBucket || !allowanceBucket) return null;
  if (!Number.isFinite(dailyBucket.periodStart) || !Number.isFinite(dailyBucket.periodEnd)) return null;
  if (!Number.isFinite(allowanceBucket.periodStart) || !Number.isFinite(allowanceBucket.periodEnd)) return null;

  const budget = input.budget ?? null;
  return {
    p_subject: input.subjectKey.trim(),
    p_request_key: input.requestKey,
    p_now: toIso(input.now),
    p_lease_ms: input.leaseMs,
    p_daily_start: toIso(dailyBucket.periodStart),
    p_daily_end: toIso(dailyBucket.periodEnd),
    // null = unconfigured allowance; the function refuses admission in that case.
    p_daily_limit: dailyBucket.limit ?? null,
    p_allowance_kind: allowanceBucket.periodKind,
    p_allowance_start: toIso(allowanceBucket.periodStart),
    p_allowance_end: toIso(allowanceBucket.periodEnd),
    p_allowance_limit: allowanceBucket.limit ?? null,
    p_budget: budget === null ? null : {
      budget_key: budget.bucket.budgetKey,
      period_start: toIso(budget.bucket.periodStart),
      period_end: toIso(budget.periodEnd),
      currency: budget.currency,
      limit_amount: budget.limitAmount,
      reserved_amount: budget.reservedAmount,
    },
  };
}

/**
 * Read-only helper for callers that hold a subject and a window: not part of the contract, and
 * intentionally absent from `DurablePersistence`. Kept internal so the port stays the single
 * surface the boundary depends on.
 */
export type DurableHistoryEntry = HistoryEntry;
