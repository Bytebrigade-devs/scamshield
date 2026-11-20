/**
 * M4-07 — feedback store tests (17 November 2026).
 *
 * Pins the owner-decided trigger/fields: explicit "Report a wrong result"; check id, category,
 * reason code and timestamp only; one record per check; no message text; no rating UI; no
 * automatic training. In-memory only — no DB, network or live entitlement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInMemoryFeedbackStore, type FeedbackEntryInput } from './feedback-store.ts';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');

function input(overrides: Partial<FeedbackEntryInput> = {}): FeedbackEntryInput {
  return {
    subjectKey: 'subject-a',
    checkId: 'check-0001',
    category: 'phishing',
    reasonCode: 'wrong_category',
    createdAt: NOW,
    ...overrides,
  };
}

test('a valid report stores exactly the decided fields plus an opaque id and trigger', () => {
  const store = createInMemoryFeedbackStore();
  const entry = store.save(input())!;
  assert.deepEqual(Object.keys(entry).sort(), [
    'category', 'checkId', 'createdAt', 'id', 'reasonCode', 'subjectKey', 'trigger',
  ]);
  assert.equal(entry.trigger, 'wrong_result');
  assert.equal(entry.checkId, 'check-0001');
  assert.equal(entry.reasonCode, 'wrong_category');
  assert.ok(entry.id.startsWith('feedback-'));
});

test('re-reporting the same check is idempotent (one record, replaced fields)', () => {
  const store = createInMemoryFeedbackStore();
  const first = store.save(input())!;
  const second = store.save(input({ reasonCode: 'wrong_url', createdAt: NOW + 60_000 }))!;
  assert.equal(store.count('subject-a'), 1);
  assert.equal(second.id, first.id, 'same record id on re-report');
  assert.equal(store.list('subject-a')[0].reasonCode, 'wrong_url');
  assert.equal(store.list('subject-a')[0].createdAt, NOW + 60_000);
});

test('different checks and subjects are counted separately', () => {
  const store = createInMemoryFeedbackStore();
  store.save(input({ checkId: 'check-1' }));
  store.save(input({ checkId: 'check-2' }));
  store.save(input({ subjectKey: 'subject-b' }));
  assert.equal(store.count('subject-a'), 2);
  assert.equal(store.count('subject-b'), 1);
  assert.equal(store.list('subject-a').length, 2);
});

test('list is newest first and subject-isolated', () => {
  const store = createInMemoryFeedbackStore();
  store.save(input({ checkId: 'old', createdAt: NOW - 1000 }));
  store.save(input({ checkId: 'new', createdAt: NOW }));
  store.save(input({ subjectKey: 'subject-b', checkId: 'other' }));
  assert.deepEqual(store.list('subject-a').map(entry => entry.checkId), ['new', 'old']);
  assert.deepEqual(store.list('subject-b').map(entry => entry.checkId), ['other']);
});

test('reports can be removed by account deletion or a user request', () => {
  const store = createInMemoryFeedbackStore();
  store.save(input({ checkId: 'one' }));
  store.save(input({ checkId: 'two' }));
  store.save(input({ subjectKey: 'subject-b' }));
  assert.equal(store.deleteAll('subject-a'), 2);
  assert.equal(store.count('subject-a'), 0);
  assert.equal(store.count('subject-b'), 1, 'other accounts untouched');
});

test('invalid or free-text reason codes are rejected (bounded code vocabulary pending)', () => {
  const store = createInMemoryFeedbackStore();
  for (const reasonCode of ['', 'Wrong category', 'WRONG', 'wrong-category', 'x'.repeat(65), '9bad']) {
    assert.equal(store.save(input({ reasonCode })), null, reasonCode);
  }
  assert.equal(store.save(input({ reasonCode: 'wrong_category' })) !== null, true);
});

test('invalid category, ids, subject or timestamp are rejected', () => {
  const store = createInMemoryFeedbackStore();
  assert.equal(store.save(input({ category: 'legitimate' as never })), null);
  assert.equal(store.save(input({ checkId: '' })), null);
  assert.equal(store.save(input({ checkId: 'has space' })), null);
  assert.equal(store.save(input({ subjectKey: '' })), null);
  assert.equal(store.save(input({ createdAt: Number.NaN })), null);
  assert.equal(store.save(input({ createdAt: 0 })), null);
});

test('the store never accepts or stores message text', () => {
  const store = createInMemoryFeedbackStore();
  const entry = store.save({ ...input(), text: 'SECRET full message' } as FeedbackEntryInput)!;
  assert.doesNotMatch(JSON.stringify(entry), /SECRET|full message/);
  assert.equal('text' in entry, false);
});

test('there is no rating UI field or training/ground-truth claim', () => {
  const store = createInMemoryFeedbackStore();
  const entry = store.save({ ...input(), rating: 1, confirmedScam: true } as FeedbackEntryInput)!;
  assert.equal('rating' in entry, false);
  assert.equal('confirmedScam' in entry, false);
  assert.equal(entry.trigger, 'wrong_result');
});

test('the store performs no network I/O, env reads or hidden clock reads', () => {
  const source = readFileSync(new URL('./feedback-store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /process\.env\./);
  assert.doesNotMatch(source, /new Date\(\)/);
});
