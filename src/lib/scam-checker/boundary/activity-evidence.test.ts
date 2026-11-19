/**
 * M4 — M6-04 `m4.scam_activity_evidence` tests (X-13 §5.1), 18 November 2026.
 *
 * Pins the builder's state rules, the mandatory limitation set, the exact field allow-list and
 * the timestamp/pair validation. All values are synthetic; no provider, network, DB or AI key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EVIDENCE_CONTRACT_VERSION,
  LIMITATION_IDS,
  SUMMARY_TYPE,
  buildScamActivityEvidence,
  validateScamActivityEvidence,
  type EvidenceInput,
} from './activity-evidence.ts';

const AS_OF = '2026-11-18T09:00:00Z';
const ATTEMPT = { occurredAt: '2026-11-18T08:59:00Z', analysisStatus: 'completed', analysisMode: 'rules_and_ai' };
const BASE: EvidenceInput = { subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'available', latestAttempt: ATTEMPT };

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

test('available evidence emits the seven allowlisted fields with the three mandatory limitations', () => {
  const evidence = buildScamActivityEvidence(BASE)!;
  assert.ok(evidence, 'expected a payload');
  assert.deepEqual(evidence, {
    contract_version: EVIDENCE_CONTRACT_VERSION,
    summary_type: SUMMARY_TYPE,
    subject_ref: 'synthetic-subject-a',
    as_of: AS_OF,
    availability: 'available',
    latest_attempt: {
      occurred_at: ATTEMPT.occurredAt,
      analysis_status: 'completed',
      analysis_mode: 'rules_and_ai',
    },
    limitations: ['self_selected_checks', 'classification_not_verified_incident', 'no_protective_action_verified'],
  });
  assert.equal(validateScamActivityEvidence(evidence), true);
});

test('unavailable evidence carries a null attempt and at least one no-evidence reason', () => {
  const evidence = buildScamActivityEvidence({
    subjectRef: 'synthetic-subject-a',
    asOf: AS_OF,
    availability: 'unavailable',
    unavailableReason: 'not_implemented',
  })!;
  assert.ok(evidence);
  assert.equal(evidence.latest_attempt, null);
  assert.deepEqual(sorted(evidence.limitations), ['no_protective_action_verified', 'not_implemented']);
  assert.ok(validateScamActivityEvidence(evidence));
});

test('a retained failed attempt is available while its analysis status is unavailable', () => {
  const evidence = buildScamActivityEvidence({
    ...BASE,
    latestAttempt: { occurredAt: ATTEMPT.occurredAt, analysisStatus: 'unavailable', analysisMode: 'none' },
  })!;
  assert.ok(evidence);
  assert.equal(evidence.availability, 'available');
  assert.equal(evidence.latest_attempt?.analysis_status, 'unavailable');
  assert.ok(validateScamActivityEvidence(evidence));
});

test('a rules-only limited attempt is accepted', () => {
  const evidence = buildScamActivityEvidence({
    ...BASE,
    latestAttempt: { occurredAt: ATTEMPT.occurredAt, analysisStatus: 'limited', analysisMode: 'rules_only' },
  })!;
  assert.ok(evidence);
  assert.equal(evidence.latest_attempt?.analysis_mode, 'rules_only');
  assert.ok(validateScamActivityEvidence(evidence));
});

test('stale evidence requires an attempt and adds stale_evidence', () => {
  const evidence = buildScamActivityEvidence({ ...BASE, availability: 'stale' })!;
  assert.ok(evidence);
  assert.deepEqual(sorted(evidence.limitations), [
    'classification_not_verified_incident', 'no_protective_action_verified',
    'self_selected_checks', 'stale_evidence',
  ]);
  assert.ok(validateScamActivityEvidence(evidence));
});

test('missing or contradictory attempt/availability combinations emit nothing', () => {
  assert.equal(buildScamActivityEvidence({ ...BASE, latestAttempt: null }), null);
  assert.equal(buildScamActivityEvidence({ ...BASE, latestAttempt: undefined }), null);
  assert.equal(buildScamActivityEvidence({
    subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'unavailable',
    latestAttempt: ATTEMPT, unavailableReason: 'not_implemented',
  }), null);
  assert.equal(buildScamActivityEvidence({ subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'unavailable' }), null);
  assert.equal(buildScamActivityEvidence({
    subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'unavailable', unavailableReason: 'because_it_is_missing',
  }), null);
  assert.equal(buildScamActivityEvidence({ ...BASE, availability: 'sometimes' }), null);
});

test('an attempt later than as_of is refused (no clock or ordering invention)', () => {
  assert.equal(buildScamActivityEvidence({
    ...BASE,
    latestAttempt: { occurredAt: '2026-11-18T09:00:01Z', analysisStatus: 'completed', analysisMode: 'rules_and_ai' },
  }), null);
  assert.equal(buildScamActivityEvidence({
    ...BASE,
    asOf: '2026-11-18T09:00:00.000Z',
    latestAttempt: { occurredAt: '2026-11-18T09:00:00.001Z', analysisStatus: 'completed', analysisMode: 'rules_and_ai' },
  }), null);
});

test('invalid status/mode pairs and malformed timestamps emit nothing', () => {
  for (const pair of [
    { analysisStatus: 'completed', analysisMode: 'rules_only' },
    { analysisStatus: 'limited', analysisMode: 'rules_and_ai' },
    { analysisStatus: 'unavailable', analysisMode: 'rules_and_ai' },
    { analysisStatus: 'unknown', analysisMode: 'none' },
    { analysisStatus: '', analysisMode: '' },
  ]) {
    assert.equal(buildScamActivityEvidence({ ...BASE, latestAttempt: { occurredAt: ATTEMPT.occurredAt, ...pair } }), null);
  }
  for (const occurredAt of ['2026-11-18 08:59:00', '2026-11-18T08:59:00+05:30', '', 12345, null]) {
    assert.equal(buildScamActivityEvidence({ ...BASE, latestAttempt: { ...ATTEMPT, occurredAt } }), null);
  }
  for (const asOf of ['2026-11-18 09:00:00', '2026-11-18T09:00:00+05:30', 'not-a-date', 0]) {
    assert.equal(buildScamActivityEvidence({ ...BASE, asOf }), null);
  }
});

test('subject_ref rejects names, emails, phones, JWTs, URLs and control characters', () => {
  for (const subjectRef of [
    'Sahan Perera',
    'sahan@example.com',
    '+94771234567',
    '0771234567',
    'eyJhbGciOiJIUzI1NiJ9.payload.signature',
    'https://example.com/subject',
    'subject\u0000ref',
    '',
    '   ',
    'x'.repeat(129),
    42,
    null,
  ]) {
    assert.equal(buildScamActivityEvidence({ ...BASE, subjectRef }), null, `expected rejection: ${String(subjectRef)}`);
  }
  assert.ok(buildScamActivityEvidence({ ...BASE, subjectRef: '  3f1c2b9a-7d4e-4a51-9c3b-5e0f6a7b8c9d  ' }));
  assert.equal(buildScamActivityEvidence({ ...BASE, subjectRef: '  3f1c2b9a  ' })?.subject_ref, '3f1c2b9a');
});

test('limitation IDs are controlled: unknown, duplicate and state-contradicting IDs are refused', () => {
  assert.equal(buildScamActivityEvidence({ ...BASE, extraLimitations: ['free_text_reason'] }), null);
  assert.equal(buildScamActivityEvidence({ ...BASE, extraLimitations: ['self_selected_checks'] }), null);
  assert.equal(buildScamActivityEvidence({ ...BASE, extraLimitations: ['stale_evidence'] }), null);
  assert.equal(buildScamActivityEvidence({ ...BASE, extraLimitations: ['not_implemented'] }), null);
  assert.equal(buildScamActivityEvidence({ ...BASE, extraLimitations: 'self_selected_checks' as unknown as string[] }), null);
  assert.equal(buildScamActivityEvidence({
    subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'unavailable',
    unavailableReason: 'not_implemented', extraLimitations: ['not_implemented'],
  }), null);
});

test('one no-evidence situation can carry several reasons, emitted in controlled order', () => {
  const evidence = buildScamActivityEvidence({
    subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'unavailable',
    unavailableReason: 'source_unavailable', extraLimitations: ['no_retained_evidence'],
  })!;
  assert.ok(evidence);
  assert.deepEqual(evidence.limitations, [
    'no_protective_action_verified', 'no_retained_evidence', 'source_unavailable',
  ]);
  assert.deepEqual(evidence.limitations, LIMITATION_IDS.filter(id => evidence.limitations.includes(id)));
  assert.ok(validateScamActivityEvidence(evidence));
});

test('no message text, contact, category, verdict or reason can enter the payload', () => {
  const evidence = buildScamActivityEvidence({
    ...BASE,
    messageText: 'Your parcel is held; pay at https://private.example/pay and call +94771234567',
    category: 'phishing',
    verdict: 'high_risk',
    reason: 'urgent payment demand',
  } as EvidenceInput)!;
  assert.ok(evidence);
  assert.deepEqual(Object.keys(evidence).sort(), [
    'as_of', 'availability', 'contract_version', 'latest_attempt', 'limitations', 'subject_ref', 'summary_type',
  ]);
  assert.deepEqual(Object.keys(evidence.latest_attempt!).sort(), ['analysis_mode', 'analysis_status', 'occurred_at']);
  const serialised = JSON.stringify(evidence);
  assert.doesNotMatch(serialised, /private\.example|94771234567|phishing|high_risk|urgent payment/i);
});

test('output is frozen and byte-stable across builds of the same facts', () => {
  const first = buildScamActivityEvidence(BASE)!;
  const second = buildScamActivityEvidence(BASE)!;
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.limitations));
  assert.ok(Object.isFrozen(first.latest_attempt));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test('the validator rejects payloads the contract forbids', () => {
  const good = buildScamActivityEvidence(BASE)!;
  const mutate = (patch: Record<string, unknown>): unknown => ({ ...good, ...patch });

  assert.equal(validateScamActivityEvidence(null), false);
  assert.equal(validateScamActivityEvidence([]), false);
  assert.equal(validateScamActivityEvidence({}), false);
  assert.equal(validateScamActivityEvidence(mutate({ extra_field: true })), false);
  assert.equal(validateScamActivityEvidence(mutate({ contract_version: '0.2.0-draft' })), false);
  assert.equal(validateScamActivityEvidence(mutate({ summary_type: 'm4.check_outcome' })), false);
  assert.equal(validateScamActivityEvidence(mutate({ subject_ref: 'sahan@example.com' })), false);
  assert.equal(validateScamActivityEvidence(mutate({ as_of: '2026-11-18T09:00:00+05:30' })), false);
  assert.equal(validateScamActivityEvidence(mutate({ availability: 'partial' })), false);
  assert.equal(validateScamActivityEvidence(mutate({ limitations: [] })), false);
  assert.equal(validateScamActivityEvidence(mutate({ limitations: ['self_selected_checks', 'self_selected_checks', 'classification_not_verified_incident', 'no_protective_action_verified'] })), false);
  assert.equal(validateScamActivityEvidence(mutate({ limitations: ['self_selected_checks', 'classification_not_verified_incident'] })), false);
  assert.equal(validateScamActivityEvidence(mutate({ limitations: ['self_selected_checks', 'classification_not_verified_incident', 'no_protective_action_verified', 'not_a_real_id'] })), false);
  assert.equal(validateScamActivityEvidence(mutate({ latest_attempt: null })), false);
  assert.equal(validateScamActivityEvidence(mutate({ latest_attempt: { occurred_at: AS_OF, analysis_status: 'completed', analysis_mode: 'rules_and_ai', category: 'phishing' } })), false);
  assert.equal(validateScamActivityEvidence(mutate({ latest_attempt: { occurred_at: '2026-11-18T09:30:00Z', analysis_status: 'completed', analysis_mode: 'rules_and_ai' } })), false);
  assert.equal(validateScamActivityEvidence(mutate({ latest_attempt: { occurred_at: AS_OF, analysis_status: 'completed', analysis_mode: 'rules_only' } })), false);

  const unavailable = buildScamActivityEvidence({
    subjectRef: 'synthetic-subject-a', asOf: AS_OF, availability: 'unavailable', unavailableReason: 'not_implemented',
  })!;
  assert.equal(validateScamActivityEvidence({ ...unavailable, latest_attempt: good.latest_attempt }), false);
  assert.equal(validateScamActivityEvidence({ ...unavailable, limitations: ['no_protective_action_verified'] }), false);
  assert.equal(validateScamActivityEvidence({ ...unavailable, limitations: ['no_protective_action_verified', 'not_implemented'] }), true);

  const stale = buildScamActivityEvidence({ ...BASE, availability: 'stale' })!;
  assert.equal(validateScamActivityEvidence({ ...stale, limitations: ['self_selected_checks', 'classification_not_verified_incident', 'no_protective_action_verified'] }), false);
});

test('no network-capable imports: the M6-04 chain stays local and shape-only (FR-M4-02)', () => {
  const specifiers = (source: string): string[] => {
    const out: string[] = [];
    for (const m of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
    for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
    for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
    return out;
  };
  const read = (name: string): string => readFileSync(new URL(name, import.meta.url), 'utf8');

  assert.deepEqual(specifiers(read('./activity-evidence.ts')), ['./check-boundary.ts', './x13-event.ts']);
  assert.deepEqual(specifiers(read('./x13-event.ts')), ['./check-boundary.ts', './taxonomy.ts']);
  for (const specifier of [...specifiers(read('./activity-evidence.ts')), ...specifiers(read('./x13-event.ts'))]) {
    assert.match(specifier, /^\.\/[\w.-]+\.ts$/, `unexpected import specifier: ${specifier}`);
    assert.doesNotMatch(specifier, /(?:^|\/)(?:dns|net|http|https|tls|dgram)(?:\/|$)/);
  }
});
