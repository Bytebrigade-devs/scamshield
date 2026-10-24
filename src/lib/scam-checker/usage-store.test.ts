/**
 * M4-02 — in-memory usage store tests.
 *
 * Requirements pinned: FS-M4-08 (denial reasons ordered monthly → daily → burst), NFR-M4-09
 * (controlled usage), NFR-M4-10 (only recordCompletion consumes quota; admitted-but-failed
 * checks never count). Quota numbers come from contracts/M4-usage-quotas-and-funding-
 * decision.md §1 (18 Oct 2026) and arrive here as Allowance values — the store invents none.
 *
 * Time arrives explicitly as epoch-ms `now` values (UTC calendar windows; sliding burst
 * window), so window boundaries are tested by arithmetic, never by waiting.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryUsageStore } from './usage-store.ts';
import { DEFAULT_LIMITS, PLAN_ALLOWANCES } from './check-boundary.ts';
import type { UsageDenial } from './check-boundary.ts';

const NOW = Date.UTC(2026, 9, 24, 10, 0, 0); // 24 October 2026, 10:00 UTC
const MIN_MS = DEFAULT_LIMITS.burstWindowMs;
const DAY_MS = 86_400_000;
const GUARDIAN = PLAN_ALLOWANCES.guardian;
const SENTINEL = PLAN_ALLOWANCES.sentinel;

function admitted(store: ReturnType<typeof createInMemoryUsageStore>, allowance = GUARDIAN, now = NOW): boolean {
  return store.admitCheck({ key: 'user-1', allowance }, now) === null;
}

function denialOf(
  store: ReturnType<typeof createInMemoryUsageStore>,
  allowance = GUARDIAN,
  now = NOW,
): UsageDenial | null {
  return store.admitCheck({ key: 'user-1', allowance }, now);
}

test('an empty store admits a check, and admissions alone never consume monthly/daily quota (NFR-M4-10)', () => {
  const store = createInMemoryUsageStore();
  // Burn through the burst window with admissions that never complete (5 total: NOW, NOW+1…).
  for (let i = 0; i < DEFAULT_LIMITS.burstMax; i += 1) {
    assert.equal(admitted(store, SENTINEL, NOW + i), true, `admission ${i + 1} inside the window is allowed`);
  }
  assert.equal(denialOf(store, SENTINEL, NOW + DEFAULT_LIMITS.burstMax)?.reason, 'rate-burst');
  // Once the window slides, a fresh check is admitted and is NOT quota-denied: sentinel's
  // daily cap is 5, so those five never-completed admissions clearly consumed nothing.
  assert.equal(admitted(store, SENTINEL, NOW + MIN_MS + DEFAULT_LIMITS.burstMax + 1), true);
});

test('monthly quota: completions are counted and the limit denies with quota-monthly', () => {
  const store = createInMemoryUsageStore();
  for (let i = 0; i < GUARDIAN.monthly; i += 1) {
    store.recordCompletion({ key: 'user-1' }, NOW + i);
  }
  const denial = denialOf(store, GUARDIAN, NOW + GUARDIAN.monthly * MIN_MS); // past the burst window
  assert.deepEqual(denial, { reason: 'quota-monthly', message: denial?.message ?? '' });
  assert.match(denial?.message ?? '', /monthly/i);
});

test('daily quota: the daily cap denies before the monthly cap with quota-daily', () => {
  const store = createInMemoryUsageStore();
  for (let i = 0; i < GUARDIAN.daily; i += 1) {
    store.recordCompletion({ key: 'user-1' }, NOW + i * MIN_MS); // spread within one day, outside burst pairs
  }
  const denial = denialOf(store, GUARDIAN, NOW + 20 * MIN_MS);
  assert.equal(denial?.reason, 'quota-daily', 'daily (15) denies long before monthly (200)');
  assert.match(denial?.message ?? '', /daily/i);
});

test('burst window: the sixth admission inside one minute is denied, the window slides', () => {
  const store = createInMemoryUsageStore();
  for (let i = 0; i < DEFAULT_LIMITS.burstMax; i += 1) {
    assert.equal(admitted(store, GUARDIAN, NOW + i), true, `admission ${i + 1} inside the window is allowed`);
  }
  const denied = denialOf(store, GUARDIAN, NOW + DEFAULT_LIMITS.burstMax);
  assert.equal(denied?.reason, 'rate-burst');
  assert.match(denied?.message ?? '', /minute/i);
  // Sliding window: once the first admissions age out, new checks are admitted again.
  assert.equal(admitted(store, GUARDIAN, NOW + MIN_MS + 1), true);
});

test('denial order is monthly, then daily, then burst', () => {
  const store = createInMemoryUsageStore();
  // Monthly exhausted AND daily exhausted AND burst exhausted: monthly wins.
  for (let i = 0; i < GUARDIAN.monthly; i += 1) store.recordCompletion({ key: 'user-1' }, NOW + i);
  const onlyDailyLeft = createInMemoryUsageStore();
  for (let i = 0; i < GUARDIAN.daily; i += 1) onlyDailyLeft.recordCompletion({ key: 'user-1' }, NOW + i * MIN_MS);
  assert.equal(denialOf(store, GUARDIAN, NOW)?.reason, 'quota-monthly');
  assert.equal(denialOf(onlyDailyLeft, GUARDIAN, NOW + 20 * MIN_MS)?.reason, 'quota-daily');
});

test('window rollover: a new UTC month and a new UTC day reset only their own counters', () => {
  const store = createInMemoryUsageStore();
  const nextDay = NOW + DAY_MS; // 25 October — new UTC day, same month
  for (let i = 0; i < SENTINEL.daily; i += 1) store.recordCompletion({ key: 'user-1' }, NOW + i * MIN_MS);
  assert.equal(denialOf(store, SENTINEL, NOW + 20 * MIN_MS)?.reason, 'quota-daily');
  assert.equal(admitted(store, SENTINEL, nextDay + MIN_MS), true, 'a new day resets the daily counter');

  const nextMonth = Date.UTC(2026, 10, 1, 10, 0, 0); // 1 November — new UTC month
  const monthlyFull = createInMemoryUsageStore();
  for (let i = 0; i < SENTINEL.monthly; i += 1) monthlyFull.recordCompletion({ key: 'user-1' }, NOW + i * MIN_MS);
  assert.notEqual(denialOf(monthlyFull, SENTINEL, NOW + 20 * MIN_MS), null);
  assert.equal(admitted(monthlyFull, SENTINEL, nextMonth + MIN_MS), true, 'a new month resets the monthly counter');
});

test('subjects are keyed independently — one user exhausting a quota never affects another', () => {
  const store = createInMemoryUsageStore();
  for (let i = 0; i < GUARDIAN.daily; i += 1) store.recordCompletion({ key: 'user-1' }, NOW + i * MIN_MS);
  assert.notEqual(denialOf(store, GUARDIAN, NOW + 20 * MIN_MS), null);
  assert.equal(store.admitCheck({ key: 'user-2', allowance: GUARDIAN }, NOW + 20 * MIN_MS), null);
});
