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

test('admissions reserve headroom; released reservations never consume quota (NFR-M4-10, review #3)', () => {
  const store = createInMemoryUsageStore();
  // Five guardian admissions inside the burst window: each reserves one unit of
  // monthly/daily headroom (review fix #3) and fills the burst window.
  for (let i = 0; i < DEFAULT_LIMITS.burstMax; i += 1) {
    assert.equal(admitted(store, GUARDIAN, NOW + i), true, `admission ${i + 1} inside the window is allowed`);
  }
  assert.equal(denialOf(store, GUARDIAN, NOW + DEFAULT_LIMITS.burstMax)?.reason, 'rate-burst');
  // All five fail to complete and are released: counted usage must still be zero.
  for (let i = 0; i < DEFAULT_LIMITS.burstMax; i += 1) store.releaseCheck({ key: 'user-1' });
  // Once the burst window slides, a SENTINEL-shaped daily cap (5) is still fully available —
  // proving the released reservations consumed nothing.
  const sentinelAdmissions = createInMemoryUsageStore();
  for (let i = 0; i < SENTINEL.daily; i += 1) {
    sentinelAdmissions.admitCheck({ key: 'user-1', allowance: SENTINEL }, NOW + i);
    sentinelAdmissions.releaseCheck({ key: 'user-1' });
  }
  assert.equal(
    sentinelAdmissions.admitCheck({ key: 'user-1', allowance: SENTINEL }, NOW + MIN_MS + 1),
    null,
    'released reservations never consume daily quota (NFR-M4-10)',
  );
});

test('review #3: simultaneous admissions cannot push completions past the limit (TOCTOU closed)', () => {
  const store = createInMemoryUsageStore();
  const allowance = { monthly: 3, daily: 3 };
  // Five checks started at the SAME instant: only 3 may be admitted.
  const results = [0, 1, 2, 3, 4].map(() => store.admitCheck({ key: 'user-1', allowance }, NOW));
  assert.deepEqual(results.slice(0, 3), [null, null, null], 'the first three simultaneous checks are admitted');
  assert.equal(results[3]?.reason, 'quota-monthly', 'the fourth is denied before it can complete');
  // Confirming the three admitted checks lands exactly on the limit — never above it.
  for (let i = 0; i < 3; i += 1) store.recordCompletion({ key: 'user-1' }, NOW + 1);
  const denial = store.admitCheck({ key: 'user-1', allowance }, NOW + MIN_MS + 1);
  assert.equal(denial?.reason, 'quota-monthly');
});

test('review #7: a trial monthly quota is anchored at first use and never resets at a calendar boundary', () => {
  const store = createInMemoryUsageStore();
  const trial = PLAN_ALLOWANCES.trial;
  const lateOctober = Date.UTC(2026, 9, 31, 23, 0);
  for (let i = 0; i < trial.monthly; i += 1) {
    store.admitCheck({ key: 'trial-1', allowance: trial }, lateOctober + i);
    store.recordCompletion({ key: 'trial-1' }, lateOctober + i);
  }
  assert.equal(store.admitCheck({ key: 'trial-1', allowance: trial }, lateOctober)?.reason, 'quota-monthly');
  // The same trial, minutes after the calendar month rolls over: NO fresh quota.
  const november = Date.UTC(2026, 10, 1, 0, 30);
  assert.equal(
    store.admitCheck({ key: 'trial-1', allowance: trial }, november)?.reason,
    'quota-monthly',
    'crossing a calendar-month boundary must not reset an anchored trial window',
  );
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
