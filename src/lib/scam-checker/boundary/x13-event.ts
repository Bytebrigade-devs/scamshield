/**
 * M4 — X-13 `m4.check_outcome` event builder (FR-M4-15 / X-13 §4.1).
 *
 * A pure, transport-free builder for the eight-field M4 → M5 usage event. It enforces the
 * valid status/mode pairs, the category fallback and the RFC-3339 timestamp, and returns
 * `null` rather than emitting an invalid event. Delivery, deduplication and exactly-once
 * behaviour are explicitly out of scope (X-13 §4.3): no emitter, queue, network or DB here.
 *
 * Never allowed in the payload: message text/snippets, contacts, verdicts, reasons,
 * account identifiers, counts or free text.
 */
import type { AnalysisMode, AnalysisStatus, CheckOutcome } from './check-boundary.ts';
import { CATEGORY_IDS, TAXONOMY_VERSION, type CategoryId } from './taxonomy.ts';

export const EVENT_CONTRACT_VERSION = '0.1.0-draft';
export const EVENT_TYPE = 'm4.check_outcome';

/** Exactly the eight allowlisted fields; no account/subject reference by design. */
export interface CheckOutcomeEvent {
  contract_version: string;
  event_type: string;
  event_id: string;
  occurred_at: string;
  taxonomy_version: string;
  category_id: CategoryId;
  analysis_status: AnalysisStatus;
  analysis_mode: AnalysisMode;
}

const EVENT_KEYS = [
  'contract_version', 'event_type', 'event_id', 'occurred_at',
  'taxonomy_version', 'category_id', 'analysis_status', 'analysis_mode',
] as const;

const VALID_PAIRS: Readonly<Record<string, readonly [AnalysisStatus, AnalysisMode]>> = Object.freeze({
  'completed/rules_and_ai': ['completed', 'rules_and_ai'],
  'limited/rules_only': ['limited', 'rules_only'],
  'unavailable/none': ['unavailable', 'none'],
});

/**
 * UTC RFC-3339 timestamp rule shared by the X-13 event and the M6-04 evidence builder.
 * Additive export; the event builder's behaviour is unchanged.
 */
export function isRfc3339Utc(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isEventId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/\s/.test(value);
}

function pairIsValid(status: AnalysisStatus, mode: AnalysisMode): boolean {
  return VALID_PAIRS[`${status}/${mode}`] !== undefined;
}

/**
 * Exported so sibling X-13 payload builders (M6-04 evidence) reuse one status/mode table
 * instead of copying it. Additive export; the event builder's behaviour is unchanged.
 */
export function isValidAnalysisPair(status: unknown, mode: unknown): boolean {
  if (typeof status !== 'string' || typeof mode !== 'string') return false;
  return pairIsValid(status as AnalysisStatus, mode as AnalysisMode);
}

/**
 * Build the X-13 event for an analysed outcome. Returns null for rejected outcomes, invalid
 * status/mode pairs, a malformed event id or a non-RFC-3339 timestamp.
 */
export function buildCheckOutcomeEvent(
  outcome: CheckOutcome,
  meta: { eventId: unknown; occurredAt: unknown },
): CheckOutcomeEvent | null {
  if (!outcome || outcome.kind !== 'analysed') return null;
  if (!pairIsValid(outcome.analysisStatus, outcome.analysisMode)) return null;
  if (!isEventId(meta.eventId) || !isRfc3339Utc(meta.occurredAt)) return null;
  const category: CategoryId = outcome.analysisStatus === 'unavailable'
    ? 'unknown_other'
    : (CATEGORY_IDS as readonly string[]).includes(outcome.category)
      ? outcome.category
      : 'unknown_other';
  return Object.freeze({
    contract_version: EVENT_CONTRACT_VERSION,
    event_type: EVENT_TYPE,
    event_id: meta.eventId,
    occurred_at: meta.occurredAt,
    taxonomy_version: TAXONOMY_VERSION,
    category_id: category,
    analysis_status: outcome.analysisStatus,
    analysis_mode: outcome.analysisMode,
  });
}

/** Structural validation for an event received/before delivery: exact keys, types, pairs. */
export function validateCheckOutcomeEvent(value: unknown): value is CheckOutcomeEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  if (keys.length !== EVENT_KEYS.length || !EVENT_KEYS.every(key => keys.includes(key))) return false;
  if (event.contract_version !== EVENT_CONTRACT_VERSION) return false;
  if (event.event_type !== EVENT_TYPE) return false;
  if (!isEventId(event.event_id) || !isRfc3339Utc(event.occurred_at)) return false;
  if (event.taxonomy_version !== TAXONOMY_VERSION) return false;
  if (!(CATEGORY_IDS as readonly string[]).includes(event.category_id as string)) return false;
  if (event.analysis_status !== 'completed' && event.analysis_status !== 'limited' && event.analysis_status !== 'unavailable') return false;
  if (event.analysis_mode !== 'rules_and_ai' && event.analysis_mode !== 'rules_only' && event.analysis_mode !== 'none') return false;
  if (!pairIsValid(event.analysis_status, event.analysis_mode)) return false;
  if (event.analysis_status === 'unavailable' && event.category_id !== 'unknown_other') return false;
  return true;
}
