/**
 * M4 — M6-04 `m4.scam_activity_evidence` builder and validator (X-13 §5.1).
 *
 * A pure, transport-free builder for the seven-field M4 → M6 evidence summary: candidate
 * evidence about M4's own check availability and processing, never a safety, protection or
 * incident conclusion. The builder derives the mandatory limitation set from the availability
 * state, validates the status/mode pair and the timestamps, and returns `null` rather than
 * emitting a payload X-13 §5.1 would reject.
 *
 * Delivery, subject binding, retention, ordering/tie handling and freshness thresholds are
 * explicitly out of scope (X-13 §5.1): no emitter, queue, network, DB or clock here. The
 * caller supplies `asOf` and the attempt facts; this module never reads the system clock.
 *
 * Never allowed in the payload: message text/snippets, contacts, URLs, category, confidence,
 * verdict, reason, incident counts, action-completion claims or scores.
 */
import type { AnalysisMode, AnalysisStatus } from './check-boundary.ts';
import { isRfc3339Utc, isValidAnalysisPair } from './x13-event.ts';

export const EVIDENCE_CONTRACT_VERSION = '0.1.0-draft';
export const SUMMARY_TYPE = 'm4.scam_activity_evidence';

/** X-13 §5.1 controlled vocabulary, in the contract's listed order (also the emit order). */
export const LIMITATION_IDS = [
  'self_selected_checks',
  'classification_not_verified_incident',
  'no_protective_action_verified',
  'no_retained_evidence',
  'not_implemented',
  'source_unavailable',
  'stale_evidence',
] as const;

export type LimitationId = typeof LIMITATION_IDS[number];

/** The three "no usable evidence" reasons; at least one is required when unavailable. */
export const UNAVAILABLE_REASONS = [
  'no_retained_evidence',
  'not_implemented',
  'source_unavailable',
] as const;

export type UnavailableReason = typeof UNAVAILABLE_REASONS[number];

export type Availability = 'available' | 'unavailable' | 'stale';

/** The only attempt facts M4 may export: when, and how the analysis ended. No body/category. */
export interface LatestAttempt {
  occurred_at: string;
  analysis_status: AnalysisStatus;
  analysis_mode: AnalysisMode;
}

export interface ScamActivityEvidence {
  contract_version: string;
  summary_type: string;
  subject_ref: string;
  as_of: string;
  availability: Availability;
  latest_attempt: LatestAttempt | null;
  limitations: readonly LimitationId[];
}

export interface EvidenceInput {
  /** Opaque, server-bound reference. Shape-checked only; this module cannot prove binding. */
  subjectRef: unknown;
  asOf: unknown;
  availability: unknown;
  latestAttempt?: { occurredAt: unknown; analysisStatus: unknown; analysisMode: unknown } | null;
  /** Required when availability is `unavailable`; ignored otherwise. */
  unavailableReason?: unknown;
  /** Extra controlled IDs beyond the mandatory set; unknown/duplicate IDs are refused. */
  extraLimitations?: readonly unknown[];
}

const TOP_KEYS = [
  'contract_version', 'summary_type', 'subject_ref', 'as_of',
  'availability', 'latest_attempt', 'limitations',
] as const;

const ATTEMPT_KEYS = ['occurred_at', 'analysis_status', 'analysis_mode'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && expected.every(key => keys.includes(key));
}

function isKnownId(value: unknown, list: readonly string[]): boolean {
  return typeof value === 'string' && list.includes(value);
}

/**
 * Hygiene only: rejects display names, emails, phone numbers, JWTs and URLs so an incidental
 * copy-paste cannot smuggle personal data into `subject_ref`. It is not an authorization
 * check — binding the ref to the signed-in subject is the caller's responsibility.
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

function buildAttempt(raw: unknown, asOf: string): LatestAttempt | null {
  if (!isRecord(raw)) return null;
  if (!isRfc3339Utc(raw.occurredAt)) return null;
  if (!isValidAnalysisPair(raw.analysisStatus, raw.analysisMode)) return null;
  if (Date.parse(raw.occurredAt) > Date.parse(asOf)) return null;
  return Object.freeze({
    occurred_at: raw.occurredAt,
    analysis_status: raw.analysisStatus as AnalysisStatus,
    analysis_mode: raw.analysisMode as AnalysisMode,
  });
}

function composeLimitations(
  availability: Availability,
  reason: unknown,
  extra: readonly unknown[] | undefined,
): LimitationId[] | null {
  const set = new Set<LimitationId>(['no_protective_action_verified']);
  if (availability !== 'unavailable') {
    set.add('self_selected_checks');
    set.add('classification_not_verified_incident');
  }
  if (availability === 'stale') set.add('stale_evidence');
  if (availability === 'unavailable') {
    if (!isKnownId(reason, UNAVAILABLE_REASONS)) return null;
    set.add(reason as UnavailableReason);
  }
  if (extra !== undefined) {
    if (!Array.isArray(extra)) return null;
    for (const id of extra) {
      if (!isKnownId(id, LIMITATION_IDS)) return null;
      const limitation = id as LimitationId;
      if (set.has(limitation)) return null;
      // Refuse state-contradicting IDs rather than silently dropping them.
      if (limitation === 'stale_evidence' && availability !== 'stale') return null;
      if (isKnownId(limitation, UNAVAILABLE_REASONS) && availability !== 'unavailable') return null;
      set.add(limitation);
    }
  }
  return LIMITATION_IDS.filter(id => set.has(id));
}

/**
 * Build the M6-04 evidence summary. Returns `null` for an invalid availability, an unusable
 * subject reference, a non-UTC/absent timestamp, a missing or malformed attempt, an attempt
 * later than `as_of`, a missing `unavailable` reason, or an unknown/duplicate limitation.
 */
export function buildScamActivityEvidence(input: EvidenceInput): ScamActivityEvidence | null {
  if (!isRecord(input)) return null;
  const availability = input.availability;
  if (availability !== 'available' && availability !== 'unavailable' && availability !== 'stale') return null;
  const subject = normaliseSubjectRef(input.subjectRef);
  if (subject === null) return null;
  if (!isRfc3339Utc(input.asOf)) return null;

  let attempt: LatestAttempt | null = null;
  if (availability === 'unavailable') {
    if (input.latestAttempt !== undefined && input.latestAttempt !== null) return null;
  } else {
    attempt = buildAttempt(input.latestAttempt, input.asOf);
    if (attempt === null) return null;
  }

  const limitations = composeLimitations(availability, input.unavailableReason, input.extraLimitations);
  if (limitations === null) return null;

  return Object.freeze({
    contract_version: EVIDENCE_CONTRACT_VERSION,
    summary_type: SUMMARY_TYPE,
    subject_ref: subject,
    as_of: input.asOf,
    availability,
    latest_attempt: attempt,
    limitations: Object.freeze(limitations),
  });
}

/**
 * Structural validation for a payload before delivery or on receipt: exact keys at both
 * levels, controlled vocabulary, the §5.1 state requirements and the timestamp ordering.
 * Accepts any known limitation ID the contract allows; `buildScamActivityEvidence` applies
 * the stricter M4 composition policy.
 */
export function validateScamActivityEvidence(value: unknown): value is ScamActivityEvidence {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, TOP_KEYS)) return false;
  if (value.contract_version !== EVIDENCE_CONTRACT_VERSION) return false;
  if (value.summary_type !== SUMMARY_TYPE) return false;
  if (normaliseSubjectRef(value.subject_ref) !== value.subject_ref) return false;
  if (!isRfc3339Utc(value.as_of)) return false;

  const availability = value.availability;
  if (availability !== 'available' && availability !== 'unavailable' && availability !== 'stale') return false;

  if (availability === 'unavailable') {
    if (value.latest_attempt !== null) return false;
  } else {
    const attempt = value.latest_attempt;
    if (!isRecord(attempt) || !hasExactKeys(attempt, ATTEMPT_KEYS)) return false;
    if (!isRfc3339Utc(attempt.occurred_at)) return false;
    if (!isValidAnalysisPair(attempt.analysis_status, attempt.analysis_mode)) return false;
    if (Date.parse(attempt.occurred_at) > Date.parse(value.as_of)) return false;
  }

  const limitations = value.limitations;
  if (!Array.isArray(limitations) || limitations.length === 0) return false;
  if (new Set(limitations).size !== limitations.length) return false;
  if (!limitations.every(id => isKnownId(id, LIMITATION_IDS))) return false;

  if (!limitations.includes('no_protective_action_verified')) return false;
  if (availability !== 'unavailable') {
    if (!limitations.includes('self_selected_checks')) return false;
    if (!limitations.includes('classification_not_verified_incident')) return false;
  }
  if (availability === 'stale' && !limitations.includes('stale_evidence')) return false;
  if (availability === 'unavailable' && !UNAVAILABLE_REASONS.some(reason => limitations.includes(reason))) return false;
  return true;
}
