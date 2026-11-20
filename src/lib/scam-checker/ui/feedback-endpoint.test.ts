/**
 * M4 — feedback endpoint support tests (M4-07, 18 November 2026).
 *
 * Pins the server-generated opaque check id, the agreed reason codes, validation of untrusted
 * reports, the bounded tracked-check map and the stored field allow-list. The module only reads
 * `kind` and `category` from an analysed outcome, so the fixtures use a minimal cast.
 * In-memory only: no database, no network, no message text anywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryFeedbackStore } from '../boundary/feedback-store.ts';
import { FEEDBACK_REASON_CODES } from '../boundary/feedback-reason-codes.ts';
import type { CheckOutcome } from '../boundary/check-boundary.ts';
import { createFeedbackSupport, MAX_TRACKED_CHECKS } from './feedback-endpoint.ts';

const NOW = 1_760_000_000_000;

function analysed(category: string): CheckOutcome {
  return { kind: 'analysed', category } as unknown as CheckOutcome;
}
function rejected(): CheckOutcome {
  return { kind: 'rejected', reason: 'invalid-input', message: 'edit' } as unknown as CheckOutcome;
}

function support() {
  const store = createInMemoryFeedbackStore();
  const feedback = createFeedbackSupport({ subjectKey: 'subject-a', now: () => NOW, store });
  return { feedback, store };
}

test('an analysed check carries a fresh opaque id and the agreed reason codes', () => {
  const { feedback } = support();
  const first = feedback.forOutcome(analysed('phishing'))!;
  assert.ok(first);
  assert.match(first.checkId, /^[0-9a-f-]{36}$/, 'server-generated UUID, not browser-supplied');
  assert.deepEqual(first.reasonCodes, FEEDBACK_REASON_CODES);
  const second = feedback.forOutcome(analysed('phishing'))!;
  assert.notEqual(first.checkId, second.checkId);
  assert.equal(feedback.forOutcome(rejected()), null, 'rejected outcomes are not reportable');
});

test('a valid report stores exactly the allowed fields and echoes acceptance', () => {
  const { feedback, store } = support();
  const option = feedback.forOutcome(analysed('romance_scam'))!;
  const outcome = feedback.report({ checkId: option.checkId, reasonCode: 'missed_scam' });
  assert.deepEqual(outcome, { status: 200, body: { accepted: true } });

  const entries = store.list('subject-a');
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.deepEqual(Object.keys(entry).sort(), ['category', 'checkId', 'createdAt', 'id', 'reasonCode', 'subjectKey', 'trigger']);
  assert.equal(entry.category, 'romance_scam');
  assert.equal(entry.reasonCode, 'missed_scam');
  assert.equal(entry.checkId, option.checkId);
  assert.equal(entry.subjectKey, 'subject-a');
  assert.equal(entry.createdAt, NOW);
  assert.equal(entry.trigger, 'wrong_result');
});

test('re-reporting the same check is idempotent and never adds a duplicate count', () => {
  const { feedback, store } = support();
  const option = feedback.forOutcome(analysed('phishing'))!;
  feedback.report({ checkId: option.checkId, reasonCode: 'false_alarm' });
  feedback.report({ checkId: option.checkId, reasonCode: 'other' });
  const entries = store.list('subject-a');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reasonCode, 'other');
});

test('unknown, malformed and free-text reports fail closed', () => {
  const { feedback } = support();
  const option = feedback.forOutcome(analysed('phishing'))!;
  assert.deepEqual(feedback.report({ checkId: option.checkId, reasonCode: 'free text' }), { status: 400, body: { error: 'bad-reason-code' } });
  assert.deepEqual(feedback.report({ checkId: 'never-issued', reasonCode: 'other' }), { status: 404, body: { error: 'unknown-check' } });
  for (const bad of [null, 'text', [], {}, { checkId: option.checkId }, { reasonCode: 'other' }, { checkId: option.checkId, reasonCode: 'other', extra: 1 },
    { checkId: '', reasonCode: 'other' }, { checkId: 'has space', reasonCode: 'other' }, { checkId: 'x'.repeat(129), reasonCode: 'other' }]) {
    assert.deepEqual(feedback.report(bad), { status: 400, body: { error: 'bad-request' } }, JSON.stringify(bad));
  }
  assert.equal(feedback.entries().length, 0, 'no failed report may be stored');
});

test('the tracked-check map is bounded: the oldest id is forgotten, not kept forever', () => {
  const { feedback } = support();
  const first = feedback.forOutcome(analysed('phishing'))!;
  for (let index = 0; index < MAX_TRACKED_CHECKS; index += 1) feedback.forOutcome(analysed('unknown_other'));
  assert.notEqual(feedback.report({ checkId: first.checkId, reasonCode: 'other' }).status, 200, 'evicted id must no longer be reportable');
  const recent = feedback.forOutcome(analysed('phishing'))!;
  assert.equal(feedback.report({ checkId: recent.checkId, reasonCode: 'other' }).status, 200);
});

test('no message text, snippet or contact can enter the stored entry', () => {
  const { feedback, store } = support();
  const option = feedback.forOutcome(analysed('phishing'))!;
  // A hostile client cannot smuggle extra fields: the body shape is exact-key validated.
  feedback.report({ checkId: option.checkId, reasonCode: 'other', text: 'secret message', snippet: 'secret', contact: '0771234567' });
  const serialised = JSON.stringify(store.list('subject-a'));
  assert.equal(store.list('subject-a').length, 0, 'the malformed report was rejected outright');
  assert.doesNotMatch(serialised, /secret|0771234567/);
});

test('an authenticated caller files feedback under their resolved subject, not the demo subject', () => {
  const { feedback, store } = support();
  const caller = feedback.forOutcome(analysed('phishing'), 'verified-user-42')!;
  assert.ok(caller, 'a valid resolved subject is accepted');
  assert.equal(feedback.report({ checkId: caller.checkId, reasonCode: 'wrong_category' }).status, 200);
  assert.equal(store.list('subject-a').length, 0, 'nothing filed under the demo subject');
  const filed = store.list('verified-user-42');
  assert.equal(filed.length, 1);
  assert.equal(filed[0].subjectKey, 'verified-user-42');
  assert.equal(filed[0].reasonCode, 'wrong_category');
  // The demo path is untouched.
  const demo = feedback.forOutcome(analysed('phishing'))!;
  assert.equal(feedback.report({ checkId: demo.checkId, reasonCode: 'other' }).status, 200);
  assert.equal(store.list('subject-a').length, 1);
});

test('a malformed resolved subject never issues a check id and never files feedback', () => {
  const { feedback, store } = support();
  for (const bad of ['', '   ', 'has space', 'x'.repeat(129), 42, null]) {
    assert.equal(feedback.forOutcome(analysed('phishing'), bad as unknown as string), null, `must reject: ${String(bad)}`);
  }
  assert.equal(store.list('subject-a').length, 0);
  assert.equal(store.count('subject-a'), 0);
});

test('entries() defaults to the demo subject and can be queried per subject', () => {
  const { feedback } = support();
  const caller = feedback.forOutcome(analysed('romance_scam'), 'verified-user-7')!;
  feedback.report({ checkId: caller.checkId, reasonCode: 'missed_scam' });
  const demo = feedback.forOutcome(analysed('phishing'))!;
  feedback.report({ checkId: demo.checkId, reasonCode: 'other' });
  assert.equal(feedback.entries().length, 1, 'demo view only');
  assert.equal(feedback.entries('verified-user-7').length, 1);
  assert.equal(feedback.entries('verified-user-7')[0].subjectKey, 'verified-user-7');
});
