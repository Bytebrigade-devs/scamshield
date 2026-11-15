/**
 * M4 — taxonomy + X-13 event tests (M4-10 / FR-M4-15).
 *
 * Repository copy: covers the `0.1.0-draft` vocabulary, the unknown/other fallback and the
 * eight-field `m4.check_outcome` builder/validator. Pure unit tests: no provider, network,
 * env or database. The workspace copy adds UI drift guards that do not exist in this repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_IDS, CATEGORY_LABELS, TAXONOMY_VERSION, categoryLabel, normaliseCategory,
  type CategoryId,
} from './taxonomy.ts';
import {
  EVENT_CONTRACT_VERSION, EVENT_TYPE, buildCheckOutcomeEvent, validateCheckOutcomeEvent,
} from './x13-event.ts';
import type { AnalysisMode, AnalysisStatus, CheckOutcome } from './check-boundary.ts';

const META = { eventId: 'synthetic-event-001', occurredAt: '2026-11-15T12:00:00.000Z' };

function outcome(
  analysisStatus: AnalysisStatus,
  analysisMode: AnalysisMode,
  category: CategoryId,
): CheckOutcome {
  return {
    kind: 'analysed', analysisStatus, analysisMode, category,
    candidates: { urls: [], emails: [], phones: [] },
    rules: { matches: [] },
    reply: null,
    limitations: [],
  } as unknown as CheckOutcome;
}

test('the five category IDs and labels are exactly the reviewed vocabulary', () => {
  assert.deepEqual([...CATEGORY_IDS], ['phishing', 'romance_scam', 'fake_invoice', 'prize_lottery_scam', 'unknown_other']);
  assert.deepEqual(CATEGORY_LABELS, {
    phishing: 'Phishing',
    romance_scam: 'Romance scam',
    fake_invoice: 'Fake invoice',
    prize_lottery_scam: 'Prize / lottery scam',
    unknown_other: 'Not classified',
  });
  assert.equal(TAXONOMY_VERSION, '0.1.0-draft');
  assert.equal(categoryLabel('unknown_other'), 'Not classified');
});

test('normaliseCategory keeps exact IDs and falls back for absent/unknown/ambiguous values', () => {
  for (const id of CATEGORY_IDS) assert.equal(normaliseCategory(id), id);
  assert.equal(normaliseCategory('  Phishing '), 'phishing');
  assert.equal(normaliseCategory('ROMANCE_SCAM'), 'romance_scam');
  assert.equal(normaliseCategory(undefined), 'unknown_other');
  assert.equal(normaliseCategory(null), 'unknown_other');
  assert.equal(normaliseCategory('legitimate'), 'unknown_other');
  assert.equal(normaliseCategory('safe'), 'unknown_other');
  assert.equal(normaliseCategory(42), 'unknown_other');
});

test('a completed outcome builds the exact eight-field event', () => {
  const event = buildCheckOutcomeEvent(outcome('completed', 'rules_and_ai', 'phishing'), META);
  assert.deepEqual(event, {
    contract_version: EVENT_CONTRACT_VERSION,
    event_type: EVENT_TYPE,
    event_id: 'synthetic-event-001',
    occurred_at: '2026-11-15T12:00:00.000Z',
    taxonomy_version: TAXONOMY_VERSION,
    category_id: 'phishing',
    analysis_status: 'completed',
    analysis_mode: 'rules_and_ai',
  });
  assert.ok(Object.isFrozen(event));
  assert.ok(validateCheckOutcomeEvent(event));
});

test('limited and unavailable outcomes build only with their valid pairs', () => {
  const limited = buildCheckOutcomeEvent(outcome('limited', 'rules_only', 'fake_invoice'), META);
  assert.ok(limited);
  assert.equal(limited!.analysis_status, 'limited');
  assert.equal(limited!.category_id, 'fake_invoice');

  const unavailable = buildCheckOutcomeEvent(outcome('unavailable', 'none', 'prize_lottery_scam'), META);
  assert.ok(unavailable);
  assert.equal(unavailable!.category_id, 'unknown_other', 'unavailable is never given a positive category');

  assert.equal(buildCheckOutcomeEvent(outcome('completed', 'rules_only', 'phishing'), META), null);
  assert.equal(buildCheckOutcomeEvent(outcome('limited', 'rules_and_ai', 'phishing'), META), null);
  assert.equal(buildCheckOutcomeEvent(outcome('unavailable', 'rules_and_ai', 'phishing'), META), null);
});

test('rejected outcomes emit no event at all', () => {
  const rejected: CheckOutcome = { kind: 'rejected', reason: 'invalid-input', message: 'nope' };
  assert.equal(buildCheckOutcomeEvent(rejected, META), null);
});

test('event id and timestamp are validated; no malformed event is emitted', () => {
  const valid = outcome('completed', 'rules_and_ai', 'phishing');
  for (const eventId of ['', '   ', 'has space', 'a'.repeat(129)]) {
    assert.equal(buildCheckOutcomeEvent(valid, { eventId, occurredAt: META.occurredAt }), null);
  }
  for (const occurredAt of ['', 'yesterday', '2026-11-15T12:00:00', '2026-11-15T12:00:00+05:30']) {
    assert.equal(buildCheckOutcomeEvent(valid, { eventId: META.eventId, occurredAt }), null);
  }
});

test('the validator rejects extra keys, wrong pairs and positive categories for unavailable', () => {
  const event = buildCheckOutcomeEvent(outcome('completed', 'rules_and_ai', 'phishing'), META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.ok(!validateCheckOutcomeEvent({ ...event, message: 'raw text' }), 'extra key must be rejected');
  assert.ok(!validateCheckOutcomeEvent({ ...event, analysis_mode: 'rules_only' }), 'invalid pair must be rejected');
  assert.ok(!validateCheckOutcomeEvent({ ...event, taxonomy_version: '9.9.9' }));
  assert.ok(!validateCheckOutcomeEvent({ ...event, category_id: 'legitimate' }));
  assert.ok(!validateCheckOutcomeEvent({ ...event, occurred_at: '2026-11-15' }));
  assert.ok(!validateCheckOutcomeEvent(null));
  assert.ok(!validateCheckOutcomeEvent('event'));

  const unavailable = buildCheckOutcomeEvent(outcome('unavailable', 'none', 'unknown_other'), META)!;
  assert.ok(!validateCheckOutcomeEvent({ ...unavailable, category_id: 'phishing' }), 'unavailable must stay unknown_other');
});

test('the event carries no message, contact, verdict or account fields', () => {
  const event = buildCheckOutcomeEvent(outcome('completed', 'rules_and_ai', 'phishing'), META)!;
  assert.deepEqual(Object.keys(event).sort(), [
    'analysis_mode', 'analysis_status', 'category_id', 'contract_version',
    'event_id', 'event_type', 'occurred_at', 'taxonomy_version',
  ]);
  assert.doesNotMatch(JSON.stringify(event), /message|snippet|contact|verdict|reason|subject/i);
});

test('the taxonomy and event modules perform no network I/O or env reads', () => {
  for (const file of ['./taxonomy.ts', './x13-event.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
    assert.doesNotMatch(source, /process\.env\./);
  }
});
