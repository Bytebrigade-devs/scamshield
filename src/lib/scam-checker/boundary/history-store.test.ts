/**
 * M4-08 — history policy and in-memory store tests (15 November 2026).
 *
 * Pins the agreed retention windows, subject isolation, deletion and the read-only-after-
 * expiry policy. Everything is in-memory and synthetic; no DB, network or live entitlement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_SNIPPET_CHARS, RETENTION_DAYS_BY_PLAN, createInMemoryHistoryStore, historyReadAccess,
  retentionDaysFor, retentionMsFor, type HistoryEntryInput,
} from './history-store.ts';
import type { EntitlementSnapshot } from './check-boundary.ts';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const DAY = 86_400_000;

function input(overrides: Partial<HistoryEntryInput> = {}): HistoryEntryInput {
  return {
    subjectKey: 'subject-a',
    planId: 'sentinel',
    createdAt: NOW - DAY,
    snippet: 'Your parcel is held; pay a fee at this link.',
    verdictLabel: 'suspicious',
    category: 'phishing',
    ...overrides,
  };
}

test('retention windows are 30/90/180 days and trial follows Sentinel', () => {
  assert.deepEqual(RETENTION_DAYS_BY_PLAN, { sentinel: 30, guardian: 90, aegis: 180, trial: 30 });
  assert.equal(retentionDaysFor('sentinel'), 30);
  assert.equal(retentionDaysFor('Guardian'), 90);
  assert.equal(retentionDaysFor('aegis'), 180);
  assert.equal(retentionDaysFor('trial'), 30);
  assert.equal(retentionDaysFor('unknown-plan'), null);
  assert.equal(retentionDaysFor(null), null);
  assert.equal(retentionMsFor('guardian'), 90 * DAY);
});

test('saving and listing returns only the minimised fields, newest first', () => {
  const store = createInMemoryHistoryStore();
  const first = store.save(input({ createdAt: NOW - 2 * DAY }))!;
  const second = store.save(input({ createdAt: NOW - DAY, category: 'fake_invoice' }))!;
  assert.ok(first.id.startsWith('history-'));
  assert.deepEqual(Object.keys(first).sort(), ['category', 'createdAt', 'id', 'planId', 'snippet', 'subjectKey', 'verdictLabel']);
  const list = store.list('subject-a', NOW);
  assert.deepEqual(list.map(entry => entry.id), [second.id, first.id]);
  assert.equal(list[0].category, 'fake_invoice');
});

test('snippet limits are enforced, never truncated', () => {
  const store = createInMemoryHistoryStore();
  assert.equal(store.save(input({ snippet: 'x'.repeat(MAX_SNIPPET_CHARS) })) !== null, true);
  assert.equal(store.save(input({ snippet: 'x'.repeat(MAX_SNIPPET_CHARS + 1) })), null);
  assert.equal(store.save(input({ snippet: '   ' })), null);
  assert.equal(store.save(input({ snippet: 42 as unknown as string })), null);
});

test('malformed or unpolicied inputs are rejected', () => {
  const store = createInMemoryHistoryStore();
  assert.equal(store.save(input({ subjectKey: '' })), null);
  assert.equal(store.save(input({ planId: 'not-a-plan' })), null);
  assert.equal(store.save(input({ createdAt: Number.NaN })), null);
  assert.equal(store.save(input({ verdictLabel: 'safe' as never })), null);
  assert.equal(store.save(input({ category: 'legitimate' as never })), null);
});

test('one subject can never read or delete another subject history', () => {
  const store = createInMemoryHistoryStore();
  const a = store.save(input({ subjectKey: 'subject-a' }))!;
  const b = store.save(input({ subjectKey: 'subject-b' }))!;
  assert.deepEqual(store.list('subject-a', NOW).map(entry => entry.id), [a.id]);
  assert.deepEqual(store.list('subject-b', NOW).map(entry => entry.id), [b.id]);
  assert.equal(store.deleteOne('subject-a', b.id), false, 'A cannot delete B');
  assert.equal(store.deleteOne('subject-b', b.id), true);
  assert.deepEqual(store.list('subject-b', NOW), []);
  assert.deepEqual(store.list('subject-a', NOW).map(entry => entry.id), [a.id]);
});

test('user deletion and account deletion remove exactly the intended records', () => {
  const store = createInMemoryHistoryStore();
  const one = store.save(input({ subjectKey: 'subject-a' }))!;
  store.save(input({ subjectKey: 'subject-a', createdAt: NOW - 2 * DAY }));
  store.save(input({ subjectKey: 'subject-b' }));
  assert.equal(store.deleteOne('subject-a', one.id), true);
  assert.equal(store.list('subject-a', NOW).length, 1);
  assert.equal(store.deleteAll('subject-a'), 1);
  assert.deepEqual(store.list('subject-a', NOW), []);
  assert.equal(store.list('subject-b', NOW).length, 1, 'other accounts untouched');
});

test('expiry is strict at the window boundary and plan-specific', () => {
  const store = createInMemoryHistoryStore();
  const atBoundary = store.save(input({ planId: 'sentinel', createdAt: NOW - 30 * DAY }))!;
  const justInside = store.save(input({ planId: 'sentinel', createdAt: NOW - 30 * DAY + 1 }))!;
  const guardianOld = store.save(input({ planId: 'guardian', createdAt: NOW - 90 * DAY }))!;
  const guardianInside = store.save(input({ planId: 'guardian', createdAt: NOW - 89 * DAY }))!;
  const aegisInside = store.save(input({ planId: 'aegis', createdAt: NOW - 179 * DAY }))!;

  const ids = store.list('subject-a', NOW).map(entry => entry.id);
  assert.ok(!ids.includes(atBoundary.id), 'exactly at the boundary is expired');
  assert.ok(ids.includes(justInside.id));
  assert.ok(!ids.includes(guardianOld.id));
  assert.ok(ids.includes(guardianInside.id));
  assert.ok(ids.includes(aegisInside.id));
});

test('purgeExpired removes expired rows across subjects and reports the count', () => {
  const store = createInMemoryHistoryStore();
  store.save(input({ subjectKey: 'subject-a', createdAt: NOW - 31 * DAY }));
  store.save(input({ subjectKey: 'subject-b', createdAt: NOW - 31 * DAY }));
  store.save(input({ subjectKey: 'subject-b', createdAt: NOW - DAY }));
  assert.equal(store.purgeExpired(NOW), 2);
  assert.equal(store.list('subject-a', NOW).length, 0);
  assert.equal(store.list('subject-b', NOW).length, 1);
});

test('read access: full while entitled, read-only after it ends, none without a snapshot', () => {
  const future = NOW + DAY;
  const past = NOW - DAY;
  const snapshot = (overrides: Partial<EntitlementSnapshot>): EntitlementSnapshot => ({
    subjectKey: 'subject-a', planId: 'guardian', status: 'active', expiresAt: future, ...overrides,
  });
  assert.equal(historyReadAccess(snapshot({}), NOW), 'full');
  assert.equal(historyReadAccess(snapshot({ status: 'trial', planId: 'sentinel' }), NOW), 'full');
  assert.equal(historyReadAccess(snapshot({ status: 'cancelled' }), NOW), 'full', 'cancelled-before-expiry still entitled');
  assert.equal(historyReadAccess(snapshot({ expiresAt: past }), NOW), 'read-only');
  assert.equal(historyReadAccess(snapshot({ expiresAt: NOW }), NOW), 'read-only', 'exact expiry instant is not entitled');
  assert.equal(historyReadAccess(snapshot({ status: 'cancelled', expiresAt: past }), NOW), 'read-only');
  assert.equal(historyReadAccess(snapshot({ status: 'suspended' }), NOW), 'read-only');
  assert.equal(historyReadAccess(snapshot({ status: 'past_due' }), NOW), 'read-only');
  assert.equal(historyReadAccess(snapshot({ expiresAt: Number.NaN }), NOW), 'none');
  assert.equal(historyReadAccess(null, NOW), 'none');
});

test('the store never accepts or stores full message text', () => {
  const store = createInMemoryHistoryStore();
  const entry = store.save({ ...input(), text: 'SECRET full message body' } as HistoryEntryInput)!;
  assert.doesNotMatch(JSON.stringify(entry), /SECRET|message body/);
  assert.equal('text' in entry, false);
});

test('history module performs no network I/O, env reads or clock reads', () => {
  const source = readFileSync(new URL('./history-store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /process\.env\./);
  assert.doesNotMatch(source, /new Date\(\)/);
});
