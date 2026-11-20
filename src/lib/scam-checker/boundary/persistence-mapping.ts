/**
 * M4 — persistence column mapping (app fields <-> durable row shapes).
 *
 * Pure, dependency-free glue between the `persistence-port.ts` app contract and the
 * steward's snake_case schema (design/M4-checker-migration-0001-draft.sql). It performs
 * NO I/O and creates no database object: it converts values so a future durable adapter
 * can bind them to parameterized statements / transaction functions.
 *
 * Conventions (matching the in-memory adapter and the steward design):
 * - camelCase app fields -> snake_case columns;
 * - epoch milliseconds <-> ISO-8601 UTC `timestamptz` strings (converted at the adapter);
 * - `plan_id` is trimmed + lowercased; `subjectKey` is trimmed (server-derived user id);
 * - `reason_highlights` / `limitations` travel as arrays (the executor binds them to jsonb);
 * - submitted message text and candidates are NEVER mapped (not persisted).
 *
 * HONESTY BOUNDARY: the synchronous `PersistencePort` cannot be implemented by a real
 * async Supabase client without an async evolution of the port; that live adapter is
 * deferred and gated on Supabase access. This module is the testable mapping layer only.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import type { ReasonHighlight } from './check-boundary.ts';
import type {
  StoredCheck, StoredCheckInput, StoredFinding, StoredFindingInput, StoredHistoryEntry,
} from './persistence-port.ts';
import type { FeedbackEntry } from './feedback-store.ts';
import type { CheckOutcomeEvent, CheckOutcomeEventV2 } from './x13-event.ts';
import { EVENT_CONTRACT_VERSION_V2 } from './x13-event.ts';

/** Epoch ms -> ISO-8601 UTC string for a `timestamptz` column. */
export function toTimestamptz(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/** ISO-8601 `timestamptz` string -> epoch ms (NaN for an unparseable value). */
export function fromTimestamptz(iso: string): number {
  return Date.parse(iso);
}

export interface ScamCheckRow {
  id: string;
  user_id: string;
  plan_id: string;
  created_at: string;
  expires_at: string;
  analysis_status: string;
  analysis_mode: string;
  category_id: string;
  taxonomy_version: string;
  verdict_label: string | null;
  risk_level: string | null;
  reason: string | null;
  reason_highlights: ReasonHighlight[];
  limitations: string[];
}

export interface ScamFindingRow {
  id: string;
  check_id: string;
  user_id: string;
  rule_id: string;
  excerpt: string;
  start_offset: number;
  end_offset: number;
  context_note: string | null;
}

export interface CheckerHistoryRow {
  id: string;
  check_id: string;
  user_id: string;
  plan_id: string;
  created_at: string;
  expires_at: string;
  snippet: string;
  verdict_label: string;
  category_id: string;
}

export interface CheckerFeedbackRow {
  id: string;
  user_id: string;
  check_id: string;
  category_id: string;
  reason_code: string;
  trigger: string;
  created_at: string;
}

export interface CheckerUsageEventRow {
  event_id: string;
  contract_version: string;
  event_type: string;
  occurred_at: string;
  taxonomy_version: string;
  category_id: string;
  analysis_status: string;
  analysis_mode: string;
  /** Present only for the agreed 0.2.0-draft revision; omitted for 0.1.0-draft. */
  subject_ref?: string;
}

/** Map a validated check input to its `scam_checks` row (no findings/history here). */
export function checkInputToRow(input: StoredCheckInput): ScamCheckRow {
  return {
    id: input.checkId,
    user_id: input.subjectKey.trim(),
    plan_id: input.planId.trim().toLowerCase(),
    created_at: toTimestamptz(input.createdAt),
    expires_at: toTimestamptz(input.expiresAt),
    analysis_status: input.analysisStatus,
    analysis_mode: input.analysisMode,
    category_id: input.categoryId,
    taxonomy_version: input.taxonomyVersion,
    verdict_label: input.verdictLabel,
    risk_level: input.riskLevel,
    reason: input.reason,
    reason_highlights: input.reasonHighlights.map(span => ({ ...span })),
    limitations: [...input.limitations],
  };
}

/** Inverse of `checkInputToRow`, re-attaching findings and the history-row id. */
export function rowToStoredCheck(row: ScamCheckRow, findings: StoredFinding[], historyId: string | null): StoredCheck {
  return {
    checkId: row.id,
    subjectKey: row.user_id,
    planId: row.plan_id,
    createdAt: fromTimestamptz(row.created_at),
    expiresAt: fromTimestamptz(row.expires_at),
    analysisStatus: row.analysis_status as StoredCheck['analysisStatus'],
    analysisMode: row.analysis_mode as StoredCheck['analysisMode'],
    categoryId: row.category_id as StoredCheck['categoryId'],
    taxonomyVersion: row.taxonomy_version,
    verdictLabel: row.verdict_label as StoredCheck['verdictLabel'],
    riskLevel: row.risk_level as StoredCheck['riskLevel'],
    reason: row.reason,
    reasonHighlights: row.reason_highlights.map(span => ({ ...span })),
    limitations: [...row.limitations],
    findings: findings.map(finding => ({ ...finding })),
    historyId,
  };
}

export function findingInputToRow(finding: StoredFindingInput, id: string, checkId: string, userId: string): ScamFindingRow {
  return {
    id,
    check_id: checkId,
    user_id: userId,
    rule_id: finding.ruleId.trim(),
    excerpt: finding.excerpt,
    start_offset: finding.start,
    end_offset: finding.end,
    context_note: finding.contextNote ?? null,
  };
}

export function rowToStoredFinding(row: ScamFindingRow): StoredFinding {
  return {
    id: row.id,
    checkId: row.check_id,
    ruleId: row.rule_id,
    excerpt: row.excerpt,
    start: row.start_offset,
    end: row.end_offset,
    contextNote: row.context_note,
  };
}

export function historyToRow(entry: StoredHistoryEntry): CheckerHistoryRow {
  return {
    id: entry.id,
    check_id: entry.checkId,
    user_id: entry.subjectKey.trim(),
    plan_id: entry.planId.trim().toLowerCase(),
    created_at: toTimestamptz(entry.createdAt),
    expires_at: toTimestamptz(entry.expiresAt),
    snippet: entry.snippet,
    verdict_label: entry.verdictLabel,
    category_id: entry.category,
  };
}

export function rowToStoredHistory(row: CheckerHistoryRow): StoredHistoryEntry {
  return {
    id: row.id,
    checkId: row.check_id,
    subjectKey: row.user_id,
    planId: row.plan_id,
    createdAt: fromTimestamptz(row.created_at),
    expiresAt: fromTimestamptz(row.expires_at),
    snippet: row.snippet,
    verdictLabel: row.verdict_label as StoredHistoryEntry['verdictLabel'],
    category: row.category_id as StoredHistoryEntry['category'],
  };
}

export function feedbackToRow(entry: FeedbackEntry): CheckerFeedbackRow {
  return {
    id: entry.id,
    user_id: entry.subjectKey.trim(),
    check_id: entry.checkId,
    category_id: entry.category,
    reason_code: entry.reasonCode,
    trigger: entry.trigger,
    created_at: toTimestamptz(entry.createdAt),
  };
}

export function rowToFeedback(row: CheckerFeedbackRow): FeedbackEntry {
  return {
    id: row.id,
    subjectKey: row.user_id,
    checkId: row.check_id,
    category: row.category_id as FeedbackEntry['category'],
    reasonCode: row.reason_code,
    trigger: row.trigger as FeedbackEntry['trigger'],
    createdAt: fromTimestamptz(row.created_at),
  };
}

/** Map an event to its row. The agreed `subject_ref` is carried only for 0.2.0-draft. */
export function eventToRow(event: CheckOutcomeEvent | CheckOutcomeEventV2): CheckerUsageEventRow {
  const row: CheckerUsageEventRow = {
    event_id: event.event_id,
    contract_version: event.contract_version,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    taxonomy_version: event.taxonomy_version,
    category_id: event.category_id,
    analysis_status: event.analysis_status,
    analysis_mode: event.analysis_mode,
  };
  if (event.contract_version === EVENT_CONTRACT_VERSION_V2) {
    row.subject_ref = (event as CheckOutcomeEventV2).subject_ref;
  }
  return row;
}

export function rowToEvent(row: CheckerUsageEventRow): CheckOutcomeEvent | CheckOutcomeEventV2 {
  const base = {
    event_id: row.event_id,
    contract_version: row.contract_version,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    taxonomy_version: row.taxonomy_version,
    category_id: row.category_id as CheckOutcomeEvent['category_id'],
    analysis_status: row.analysis_status as CheckOutcomeEvent['analysis_status'],
    analysis_mode: row.analysis_mode as CheckOutcomeEvent['analysis_mode'],
  };
  if (row.contract_version === EVENT_CONTRACT_VERSION_V2 && typeof row.subject_ref === 'string') {
    return { ...base, subject_ref: row.subject_ref };
  }
  return base;
}
