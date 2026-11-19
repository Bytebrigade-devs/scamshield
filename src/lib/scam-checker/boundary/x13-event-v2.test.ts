/**
 * M4 — X-13 `0.2.0-draft` nine-field event tests.
 *
 * Pins the agreed revision: the eight existing fields plus the opaque `subject_ref`
 * (name confirmed by Vishmi + Lahiru, 19 Nov 2026). The 0.1.0-draft builder/validator stay
 * unchanged. Pure unit tests: no provider, network, env or database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_CONTRACT_VERSION, EVENT_CONTRACT_VERSION_V2, SUBJECT_REF_FIELD,
  buildCheckOutcomeEvent, buildCheckOutcomeEventV2,
  validateCheckOutcomeEvent, validateCheckOutcomeEventV2,
} from './x13-event.ts';
import { TAXONOMY_VERSION } from './taxonomy.ts';
import type { AnalysisMode, AnalysisStatus, CheckOutcome } from './check-boundary.ts';

const META = { eventId: 'synthetic-event-v2-001', occurredAt: '2026-11-19T12:00:00.000Z', subjectRef: 'subj-9f3a-uuid' };

function outcome(
  analysisStatus: AnalysisStatus = 'completed',
  analysisMode: AnalysisMode = 'rules_and_ai',
): CheckOutcome {
  return {
    kind: 'analysed', analysisStatus, analysisMode, category: 'phishing',
    candidates: { urls: [], emails: [], phones: [] },
    rules: { matches: [] },
    reply: null,
    limitations: [],
  };
}

test('v2: a valid event carries exactly nine fields at 0.2.0-draft with the reference', () => {
  const event = buildCheckOutcomeEventV2(outcome(), META);
  assert.ok(event);
  assert.equal(event.contract_version, EVENT_CONTRACT_VERSION_V2);
  assert.equal(event.subject_ref, 'subj-9f3a-uuid');
  assert.deepEqual(
    Object.keys(event).sort(),
    ['analysis_mode', 'analysis_status', 'category_id', 'contract_version', 'event_id',
      'event_type', 'occurred_at', 'subject_ref', 'taxonomy_version'],
  );
  assert.equal(SUBJECT_REF_FIELD, 'subject_ref');
  assert.equal(validateCheckOutcomeEventV2(event), true);
});

test('v2: an unusable subject reference yields null (never a guessed or raw identifier)', () => {
  const badRefs = ['', '   ', 'has space', 'user@example.com', '+94771234567',
    'eyJhbGciOi.eyJzdWIi.sig', 'https://example.com/x', 'x'.repeat(129), 'line\u0000break'];
  for (const subjectRef of badRefs) {
    assert.equal(buildCheckOutcomeEventV2(outcome(), { ...META, subjectRef }), null, `ref ${JSON.stringify(subjectRef)} must be rejected`);
  }
  assert.equal(buildCheckOutcomeEventV2(outcome(), { ...META, subjectRef: undefined }), null);
});

test('v2: validator rejects extra keys, a missing reference and the old version', () => {
  const event = buildCheckOutcomeEventV2(outcome(), META)!;
  assert.equal(validateCheckOutcomeEventV2({ ...event, extra: 'x' }), false);
  const { subject_ref: _ref, ...withoutRef } = event;
  assert.equal(validateCheckOutcomeEventV2(withoutRef), false);
  const v1 = buildCheckOutcomeEvent(outcome(), { eventId: META.eventId, occurredAt: META.occurredAt })!;
  assert.equal(validateCheckOutcomeEventV2(v1), false, 'an 0.1.0-draft event is not a v2 event');
});

test('v1: the eight-field builder/validator are unchanged by the revision', () => {
  const v1 = buildCheckOutcomeEvent(outcome(), { eventId: META.eventId, occurredAt: META.occurredAt });
  assert.ok(v1);
  assert.equal(v1.contract_version, EVENT_CONTRACT_VERSION);
  assert.equal(Object.keys(v1).length, 8);
  assert.equal(validateCheckOutcomeEvent(v1), true);
  assert.equal(validateCheckOutcomeEvent({ ...v1, subject_ref: 'x' }), false, 'v1 still rejects a ninth key');
});

test('v2: unavailable forces unknown_other and invalid pairs are rejected', () => {
  const unavailable = buildCheckOutcomeEventV2(outcome('unavailable', 'none'), META);
  assert.ok(unavailable);
  assert.equal(unavailable.category_id, 'unknown_other');
  assert.equal(buildCheckOutcomeEventV2(outcome('completed', 'rules_only'), META), null);
  const badPair = { ...buildCheckOutcomeEventV2(outcome(), META)!, analysis_mode: 'none' as const };
  assert.equal(validateCheckOutcomeEventV2(badPair), false);
});

test('v2: a rejected outcome produces no event', () => {
  const rejected: CheckOutcome = { kind: 'rejected', reason: 'quota-denied', message: 'limit' };
  assert.equal(buildCheckOutcomeEventV2(rejected, META), null);
});

test('v2: taxonomy version and timestamp rules still apply', () => {
  const event = buildCheckOutcomeEventV2(outcome(), META)!;
  assert.equal(event.taxonomy_version, TAXONOMY_VERSION);
  assert.equal(validateCheckOutcomeEventV2({ ...event, occurred_at: '2026-11-19 12:00:00' }), false);
  assert.equal(validateCheckOutcomeEventV2({ ...event, taxonomy_version: '9.9.9' }), false);
});
