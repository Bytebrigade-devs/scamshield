/**
 * M4 — risk level and reason-highlight validation tests (M4-06/M4-09 repository slice).
 *
 * Pins the additive display metadata: a qualitative risk band and bounded, exact excerpts from
 * the AI reason. Neither is a verdict, probability or fabricated quotation. Optional metadata
 * never invalidates a usable reply.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAXONOMY_VERSION, validateReply } from './check-boundary.ts';

const REASON = 'Please share your password immediately; the security centre says the account will be suspended today unless you confirm your identity and restore access without delay. Do not ignore this notice.';
const REPLY = { verdict: 'suspicious', category: 'phishing', taxonomy_version: TAXONOMY_VERSION, reason: REASON };

test('valid highlights keep exact spans and offsets into the reason', () => {
  const reply = validateReply({ ...REPLY, reason_highlights: ['share your password', 'suspended today'] })!;
  assert.equal(reply.reasonHighlights.length, 2);
  const [first] = reply.reasonHighlights;
  assert.equal(first.excerpt, 'share your password');
  assert.equal(REASON.slice(first.start, first.end), first.excerpt);
});

test('invented or absent excerpts are dropped rather than highlighted', () => {
  const reply = validateReply({ ...REPLY, reason_highlights: ['this text is not in the reason', 'password'] })!;
  assert.deepEqual(reply.reasonHighlights.map(span => span.excerpt), ['password']);
});

test('at most four excerpts are considered', () => {
  const reason = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
  const reply = validateReply({ ...REPLY, reason, reason_highlights: ['one', 'two', 'three', 'four', 'five'] })!;
  assert.equal(reply.reasonHighlights.length, 4);
});

test('overlapping spans are merged into one exact excerpt', () => {
  const reason = 'verify your account now and confirm the security settings before the deadline passes permanently';
  const reply = validateReply({ ...REPLY, reason, reason_highlights: ['verify your', 'your account'] })!;
  assert.equal(reply.reasonHighlights.length, 1);
  assert.equal(reply.reasonHighlights[0].excerpt, 'verify your account');
});

test('a combined emphasis over 35% of the reason is rejected (no highlight flooding)', () => {
  const reason = 'Pay now.';
  const reply = validateReply({ ...REPLY, reason, reason_highlights: ['Pay now.'] })!;
  assert.deepEqual(reply.reasonHighlights, []);
});

test('risk levels are validated; absent or unknown values become undetermined', () => {
  assert.equal(validateReply({ ...REPLY, risk_level: 'high' })!.riskLevel, 'high');
  assert.equal(validateReply({ ...REPLY, risk_level: 'low' })!.riskLevel, 'low');
  assert.equal(validateReply({ ...REPLY, risk_level: 'suspicious' })!.riskLevel, 'suspicious');
  assert.equal(validateReply({ ...REPLY, risk_level: 'HIGH RISK' })!.riskLevel, 'undetermined');
  assert.equal(validateReply({ ...REPLY, risk_level: 5 })!.riskLevel, 'undetermined');
  assert.equal(validateReply(REPLY)!.riskLevel, 'undetermined');
});

test('malformed highlight metadata leaves a usable reply untouched', () => {
  for (const value of ['password', 42, { span: 1 }, [42, null, '']]) {
    const reply = validateReply({ ...REPLY, reason_highlights: value });
    assert.ok(reply, 'reply must stay valid');
    assert.deepEqual(reply!.reasonHighlights, []);
    assert.equal(reply!.reason, REASON, 'the explanation is never rewritten');
  }
});

test('highlights require a reason; without one they are empty', () => {
  const reply = validateReply({ verdict: 'suspicious', taxonomy_version: TAXONOMY_VERSION, reason_highlights: ['password'] })!;
  assert.deepEqual(reply.reasonHighlights, []);
});

test('UTF-16 offsets match the excerpt (surrogate pairs)', () => {
  const reason = '⚠️ Please verify your account now and then confirm the security settings before the deadline passes.';
  const reply = validateReply({ ...REPLY, reason, reason_highlights: ['account'] })!;
  const [span] = reply.reasonHighlights;
  assert.equal(reason.slice(span.start, span.end), span.excerpt);
});

test('the reply carries no raw message or fabricated quote fields', () => {
  const reply = validateReply({ ...REPLY, reason_highlights: ['password', 'never said this'] })!;
  assert.doesNotMatch(JSON.stringify(reply), /never said this/);
  assert.deepEqual(Object.keys(reply).sort(), ['category', 'reason', 'reasonHighlights', 'riskLevel', 'verdictLabel']);
});
