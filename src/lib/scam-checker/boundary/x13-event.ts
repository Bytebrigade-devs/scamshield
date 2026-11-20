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

// ---- 0.2.0-draft revision: nine fields (agreed 19 November 2026) ----
// The reference field name `subject_ref` was confirmed by Vishmi (M5) + Lahiru (M2) on
// 19 November 2026, and by Prashnidha (M3, schema steward) on 20 November 2026. The
// SQL-side review of the columns is still PENDING (steward, 20 Nov) — this comment records
// agreement on the NAME only. This is an additive revision: the 0.1.0-draft builder/validator
// above remain unchanged, so existing eight-field events stay valid. No emitter/delivery exists.

export const EVENT_CONTRACT_VERSION_V2 = '0.2.0-draft';
/** Agreed reference field name (Vishmi + Lahiru, 19 Nov 2026; Prashnidha, 20 Nov 2026). */
export const SUBJECT_REF_FIELD = 'subject_ref';

export interface CheckOutcomeEventV2 extends CheckOutcomeEvent {
  /** Opaque, server-generated per-user reference; never a raw id/email/token. */
  subject_ref: string;
}

const EVENT_KEYS_V2 = [...EVENT_KEYS, SUBJECT_REF_FIELD] as const;

/**
 * Same opaque-reference hygiene as the M6 evidence summary: shape only, not subject binding.
 * Binding the ref to the signed-in subject is the caller's responsibility.
 */
function normaliseSubjectRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ref = value.trim();
  if (ref.length === 0 || ref.length > 128) return null;
  if (/\s/.test(ref)) return null;
  if (/[\u0000-\u001F\u007F]/.test(ref)) return null;
  if (ref.includes('@')) return null;
  if (/^\+?\d{7,}$/.test(ref)) return null;
  if (/^eyJ[\w-]*\./.test(ref)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return null;
  return ref;
}

/**
 * Build the nine-field `0.2.0-draft` event. Returns null for any invalid outcome/meta or an
 * unusable subject reference. The reference must be supplied server-side by the caller.
 */
export function buildCheckOutcomeEventV2(
  outcome: CheckOutcome,
  meta: { eventId: unknown; occurredAt: unknown; subjectRef: unknown },
): CheckOutcomeEventV2 | null {
  const base = buildCheckOutcomeEvent(outcome, meta);
  if (base === null) return null;
  const ref = normaliseSubjectRef(meta.subjectRef);
  if (ref === null) return null;
  return Object.freeze({
    ...base,
    contract_version: EVENT_CONTRACT_VERSION_V2,
    subject_ref: ref,
  });
}

/** Structural validation for the nine-field revision: exact keys, types, pairs, ref hygiene. */
export function validateCheckOutcomeEventV2(value: unknown): value is CheckOutcomeEventV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  if (keys.length !== EVENT_KEYS_V2.length || !EVENT_KEYS_V2.every(key => keys.includes(key))) return false;
  if (event.contract_version !== EVENT_CONTRACT_VERSION_V2) return false;
  if (event.event_type !== EVENT_TYPE) return false;
  if (!isEventId(event.event_id) || !isRfc3339Utc(event.occurred_at)) return false;
  if (event.taxonomy_version !== TAXONOMY_VERSION) return false;
  if (!(CATEGORY_IDS as readonly string[]).includes(event.category_id as string)) return false;
  if (event.analysis_status !== 'completed' && event.analysis_status !== 'limited' && event.analysis_status !== 'unavailable') return false;
  if (event.analysis_mode !== 'rules_and_ai' && event.analysis_mode !== 'rules_only' && event.analysis_mode !== 'none') return false;
  if (!pairIsValid(event.analysis_status, event.analysis_mode)) return false;
  if (event.analysis_status === 'unavailable' && event.category_id !== 'unknown_other') return false;
  if (normaliseSubjectRef(event.subject_ref) !== event.subject_ref) return false;
  return true;
}
