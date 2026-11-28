/**
 * M4 — feedback endpoint support tests (M4-07).
 *
 * Pins the server-generated opaque check id, the agreed reason codes, validation of untrusted
 * reports, the bounded tracked-check map, the stored field allow-list, and — since the durable
 * wiring of 24 Nov 2026 — that a persisted check id is proven by an owned-check read before any
 * durable write. In-memory only except where a durable port double is injected: no database, no
 * network, no message text anywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryFeedbackStore } from '../boundary/feedback-store.ts';
import { FEEDBACK_REASON_CODES } from '../boundary/feedback-reason-codes.ts';
import type { CheckOutcome } from '../boundary/check-boundary.ts';
import type { StoredCheck } from '../boundary/persistence-port.ts';
import { createFeedbackSupport, MAX_TRACKED_CHECKS } from './feedback-endpoint.ts';

const NOW = 1_760_000_000_000;
const USER = '11111111-1111-4111-8111-111111111111';

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

/** Durable configuration: a fake port records writes; the owned-check read decides acceptance. */
function durableSupport(owned: (checkId: string, subjectKey: string, now: number) => Promise<StoredCheck | null>) {
  const store = createInMemoryFeedbackStore();
  const saved: Array<{ checkId: string; category: string; subjectKey: string }> = [];
  const feedback = createFeedbackSupport({
    subjectKey: 'subject-a',
    now: () => NOW,
    store,
    feedbackPort: {
      save: async (input) => {
        saved.push({ checkId: input.checkId, category: input.category, subjectKey: input.subjectKey });
        return { ...input, id: 'feedback-1', trigger: 'wrong_result' };
      },
      listOwned: async () => [],
    },
    readOwnedCheck: owned,
  });
  return { feedback, saved };
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

test('a valid report stores exactly the allowed fields and echoes acceptance', async () => {
  const { feedback, store } = support();
  const option = feedback.forOutcome(analysed('romance_scam'))!;
  const outcome = await feedback.report({ checkId: option.checkId, reasonCode: 'missed_scam' });
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

test('re-reporting the same check is idempotent and never adds a duplicate count', async () => {
  const { feedback, store } = support();
  const option = feedback.forOutcome(analysed('phishing'))!;
  await feedback.report({ checkId: option.checkId, reasonCode: 'false_alarm' });
  await feedback.report({ checkId: option.checkId, reasonCode: 'other' });
  const entries = store.list('subject-a');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reasonCode, 'other');
});

test('unknown, malformed and free-text reports fail closed', async () => {
  const { feedback } = support();
  const option = feedback.forOutcome(analysed('phishing'))!;
  assert.deepEqual(await feedback.report({ checkId: option.checkId, reasonCode: 'free text' }), { status: 400, body: { error: 'bad-reason-code' } });
  assert.deepEqual(await feedback.report({ checkId: 'never-issued', reasonCode: 'other' }), { status: 404, body: { error: 'unknown-check' } });
  for (const bad of [null, 'text', [], {}, { checkId: option.checkId }, { reasonCode: 'other' }, { checkId: option.checkId, reasonCode: 'other', extra: 1 },
    { checkId: '', reasonCode: 'other' }, { checkId: 'has space', reasonCode: 'other' }, { checkId: 'x'.repeat(129), reasonCode: 'other' }]) {
    assert.deepEqual(await feedback.report(bad), { status: 400, body: { error: 'bad-request' } }, JSON.stringify(bad));
  }
  assert.equal(feedback.entries().length, 0, 'no failed report may be stored');
});

test('the tracked-check map is bounded: the oldest id is forgotten, not kept forever', async () => {
  const { feedback } = support();
  const first = feedback.forOutcome(analysed('phishing'))!;
  for (let index = 0; index < MAX_TRACKED_CHECKS; index += 1) feedback.forOutcome(analysed('unknown_other'));
  assert.notEqual((await feedback.report({ checkId: first.checkId, reasonCode: 'other' })).status, 200, 'evicted id must no longer be reportable');
  const recent = feedback.forOutcome(analysed('phishing'))!;
  assert.equal((await feedback.report({ checkId: recent.checkId, reasonCode: 'other' })).status, 200);
});

test('no message text, snippet or contact can enter the stored entry', async () => {
  const { feedback, store } = support();
  const option = feedback.forOutcome(analysed('phishing'))!;
  // A hostile client cannot smuggle extra fields: the body shape is exact-key validated.
  await feedback.report({ checkId: option.checkId, reasonCode: 'other', text: 'secret message', snippet: 'secret', contact: '0771234567' });
  const serialised = JSON.stringify(store.list('subject-a'));
  assert.equal(store.list('subject-a').length, 0, 'the malformed report was rejected outright');
  assert.doesNotMatch(serialised, /secret|0771234567/);
});

test('an authenticated caller files feedback under their resolved subject, not the demo subject', async () => {
  const { feedback, store } = support();
  const caller = feedback.forOutcome(analysed('phishing'), 'verified-user-42')!;
  assert.ok(caller, 'a valid resolved subject is accepted');
  assert.equal((await feedback.report({ checkId: caller.checkId, reasonCode: 'wrong_category' })).status, 200);
  assert.equal(store.list('subject-a').length, 0, 'nothing filed under the demo subject');
  const filed = store.list('verified-user-42');
  assert.equal(filed.length, 1);
  assert.equal(filed[0].subjectKey, 'verified-user-42');
  assert.equal(filed[0].reasonCode, 'wrong_category');
  // The demo path is untouched.
  const demo = feedback.forOutcome(analysed('phishing'))!;
  assert.equal((await feedback.report({ checkId: demo.checkId, reasonCode: 'other' })).status, 200);
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

test('entries() defaults to the demo subject and can be queried per subject', async () => {
  const { feedback } = support();
  const caller = feedback.forOutcome(analysed('romance_scam'), 'verified-user-7')!;
  await feedback.report({ checkId: caller.checkId, reasonCode: 'missed_scam' });
  const demo = feedback.forOutcome(analysed('phishing'))!;
  await feedback.report({ checkId: demo.checkId, reasonCode: 'other' });
  assert.equal(feedback.entries().length, 1, 'demo view only');
  assert.equal(feedback.entries('verified-user-7').length, 1);
  assert.equal(feedback.entries('verified-user-7')[0].subjectKey, 'verified-user-7');
});

// ---- durable path (24 November 2026) ----

test('durable: a persisted id is proven by the owned-check read, then written with its category', async () => {
  const { feedback, saved } = durableSupport(async (checkId) => (
    checkId === 'chk-persisted'
      ? ({ checkId, categoryId: 'prize_lottery_scam' } as unknown as StoredCheck)
      : null
  ));
  // A persisted id is issued by the service and is NOT added to the in-memory map.
  const option = feedback.forOutcome(analysed('prize_lottery_scam'), USER, 'chk-persisted')!;
  assert.equal(option.checkId, 'chk-persisted');

  const result = await feedback.report({ checkId: 'chk-persisted', reasonCode: 'false_alarm' }, USER);
  assert.deepEqual(result, { status: 200, body: { accepted: true } });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.category, 'prize_lottery_scam', 'category comes from the stored check');
  assert.equal(saved[0]!.subjectKey, USER);
});

test('durable: an unknown or foreign check is refused before any write', async () => {
  const { feedback, saved } = durableSupport(async () => null);
  const result = await feedback.report({ checkId: 'chk-forged', reasonCode: 'other' }, USER);
  assert.deepEqual(result, { status: 404, body: { error: 'unknown-check' } });
  assert.equal(saved.length, 0, 'nothing may be written for an unowned id');
});

test('durable: without a resolved subject the report cannot reach the durable writer', async () => {
  const { feedback, saved } = durableSupport(async () => ({ checkId: 'chk-1' } as unknown as StoredCheck));
  const result = await feedback.report({ checkId: 'chk-1', reasonCode: 'other' });
  assert.deepEqual(result, { status: 404, body: { error: 'unknown-check' } });
  assert.equal(saved.length, 0);
});
