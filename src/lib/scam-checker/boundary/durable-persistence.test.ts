/**
 * M4 — durable persistence (async) interface tests.
 *
 * Pins the async contract recorded in evidence/M4-async-persistence-decision-20261119.md:
 * every operation resolves (never a bare value), and the wrapped synchronous port keeps the
 * recorded semantics — exactly-once settlement where ONLY completed consumes quota,
 * idempotent append/upsert, retention purge, limit-enforcing admission, and direction-(c)
 * account deletion (user-linked quota/reservations removed, budget totals retained).
 *
 * The double is the in-memory port: no Supabase client, no SQL, no network, no clock.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncPersistence, M4_TRANSACTION_FUNCTIONS } from './durable-persistence.ts';
import {
  createInMemoryPersistence, type QuotaReservationInput, type StoredCheckInput,
} from './persistence-port.ts';
import { EVENT_CONTRACT_VERSION, EVENT_TYPE, type CheckOutcomeEvent } from './x13-event.ts';
import { TAXONOMY_VERSION } from './taxonomy.ts';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0); // 19 Nov 2026 12:00 UTC
const DAY_START = Date.UTC(2026, 10, 19);
const MONTH_START = Date.UTC(2026, 10, 1);
const MONTH_END = Date.UTC(2026, 11, 1);

function checkInput(overrides: Partial<StoredCheckInput> = {}): StoredCheckInput {
  return {
    checkId: 'check-1',
    subjectKey: 'subject-a',
    planId: 'sentinel',
    createdAt: NOW,
    expiresAt: NOW + 30 * DAY_MS,
    analysisStatus: 'completed',
    analysisMode: 'rules_and_ai',
    categoryId: 'phishing',
    taxonomyVersion: TAXONOMY_VERSION,
    verdictLabel: 'suspicious',
    riskLevel: 'high',
    reason: 'credential request with a threat',
    reasonHighlights: [{ start: 0, end: 10, excerpt: 'credential' }],
    limitations: [],
    findings: [{ ruleId: 'R-M4-01', excerpt: 'suspended', start: 26, end: 35, contextNote: 'threat' }],
    history: { snippet: 'Your bank account will be suspended…', verdictLabel: 'suspicious' },
    ...overrides,
  };
}

function event(overrides: Partial<CheckOutcomeEvent> = {}): CheckOutcomeEvent {
  return {
    contract_version: EVENT_CONTRACT_VERSION,
    event_type: EVENT_TYPE,
    event_id: 'event-1',
    occurred_at: '2026-11-19T10:00:00.000Z',
    taxonomy_version: TAXONOMY_VERSION,
    category_id: 'phishing',
    analysis_status: 'completed',
    analysis_mode: 'rules_and_ai',
    ...overrides,
  };
}

function reservation(overrides: Partial<QuotaReservationInput> = {}): QuotaReservationInput {
  return {
    subjectKey: 'subject-a',
    requestKey: 'request-1',
    now: NOW,
    leaseMs: 60_000,
    dailyBucket: { periodKind: 'daily', periodStart: DAY_START, periodEnd: DAY_START + DAY_MS, limit: 5 },
    allowanceBucket: { periodKind: 'monthly', periodStart: MONTH_START, periodEnd: MONTH_END, limit: 60 },
    ...overrides,
  };
}

test('every durable operation returns a promise and resolves', async () => {
  const fresh = () => createAsyncPersistence(createInMemoryPersistence());
  const calls: Array<[string, () => Promise<unknown>]> = [];
  const async = fresh();

  calls.push(['checks.save', () => async.checks.save(checkInput())]);
  calls.push(['checks.getOwned', () => async.checks.getOwned('missing', 'subject-a', NOW)]);
  calls.push(['checks.deleteCheck', () => async.checks.deleteCheck('missing', 'subject-a')]);
  calls.push(['checks.purgeExpired', () => async.checks.purgeExpired(NOW)]);
  calls.push(['history.listOwned', () => async.history.listOwned('subject-a', NOW)]);
  calls.push(['feedback.save', () => async.feedback.save({
    subjectKey: 'subject-a', checkId: 'missing', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW,
  })]);
  calls.push(['feedback.listOwned', () => async.feedback.listOwned('subject-a')]);
  calls.push(['events.append', () => async.events.append(event())]);
  calls.push(['events.listAll', () => async.events.listAll()]);
  calls.push(['events.purgeBefore', () => async.events.purgeBefore(NOW)]);
  calls.push(['quota.getOrCreateBucket', () => async.quota.getOrCreateBucket(
    { subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START, periodEnd: DAY_START + DAY_MS },
    NOW,
  )]);
  calls.push(['quota.reserve', () => async.quota.reserve(reservation())]);
  calls.push(['quota.settle', () => async.quota.settle('missing', { analysisStatus: 'completed' }, NOW)]);
  calls.push(['quota.markReconciliationRequired', () => async.quota.markReconciliationRequired('missing', 'limited', NOW)]);
  calls.push(['quota.finalizeReconciliation', () => async.quota.finalizeReconciliation('missing', 0, NOW)]);
  calls.push(['quota.reservationByRequestKey', () => async.quota.reservationByRequestKey('missing')]);
  calls.push(['quota.getBucket', () => async.quota.getBucket(
    { subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START },
  )]);
  calls.push(['budget.getBucket', () => async.budget.getBucket({ budgetKey: 'monthly-provider', periodStart: NOW })]);
  calls.push(['deleteSubject', () => async.deleteSubject('subject-a')]);

  assert.equal(calls.length, 19);
  for (const [name, call] of calls) {
    const result = call();
    assert.ok(result instanceof Promise, `${name} must return a promise`);
    await result;
  }
});

test('save then getOwned round-trips; foreign and expired reads resolve to null', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  const saved = await port.checks.save(checkInput());
  assert.ok(saved);
  assert.equal(saved.findings.length, 1);
  assert.ok(saved.historyId);

  const owned = await port.checks.getOwned('check-1', 'subject-a', NOW);
  assert.ok(owned);
  assert.equal(owned.reasonHighlights.length, 1);

  assert.equal(await port.checks.getOwned('check-1', 'subject-b', NOW), null);
  assert.equal(await port.checks.getOwned('check-1', 'subject-a', NOW + 30 * DAY_MS), null);
});

test('invalid input resolves null instead of throwing', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  assert.equal(await port.checks.save(checkInput({ planId: '' })), null);
  assert.equal(await port.checks.save(checkInput({ expiresAt: NOW })), null);
  assert.equal(await port.feedback.save({
    subjectKey: '', checkId: 'check-1', category: 'phishing', reasonCode: 'false_alarm', createdAt: NOW,
  }), null);
  assert.equal(await port.quota.reserve(reservation({ requestKey: '' })), null);
});

test('history listing is newest first and hides expired rows', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  await port.checks.save(checkInput({ checkId: 'check-old', createdAt: NOW - DAY_MS }));
  await port.checks.save(checkInput({
    checkId: 'check-new', createdAt: NOW, history: { snippet: 'Newest message', verdictLabel: 'suspicious' },
  }));
  await port.checks.save(checkInput({
    checkId: 'check-expired', createdAt: NOW - 40 * DAY_MS, expiresAt: NOW - DAY_MS,
    history: { snippet: 'Expired message', verdictLabel: 'suspicious' },
  }));

  const list = await port.history.listOwned('subject-a', NOW);
  assert.deepEqual(list.map(entry => entry.checkId), ['check-new', 'check-old']);
  assert.deepEqual(await port.history.listOwned('subject-b', NOW), []);
});

test('feedback upsert is idempotent per subject and check', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  await port.checks.save(checkInput());
  const first = await port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW,
  });
  const second = await port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'missed_scam', createdAt: NOW + 1_000,
  });
  assert.ok(first && second);
  assert.equal(second.id, first.id);
  assert.equal((await port.feedback.listOwned('subject-a')).length, 1);
  assert.equal(await port.feedback.save({
    subjectKey: 'subject-b', checkId: 'check-1', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW,
  }), null);
});

test('event append is idempotent; a conflicting duplicate resolves false', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  assert.equal(await port.events.append(event()), true);
  assert.equal(await port.events.append(event()), true);
  assert.equal(await port.events.append(event({ category_id: 'romance_scam' })), false);
  assert.equal((await port.events.listAll()).length, 1);
  assert.equal(await port.events.purgeBefore(NOW), 1);
  assert.deepEqual(await port.events.listAll(), []);
});

test('completed settlement consumes quota and settles exactly once', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  const reserved = await port.quota.reserve(reservation());
  assert.ok(reserved);

  assert.equal(await port.quota.settle(reserved.id, { analysisStatus: 'completed' }, NOW + 1_000), true);
  const bucket = await port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.ok(bucket);
  assert.equal(bucket.completedCount, 1);
  assert.equal(bucket.reservedCount, 0);

  // Exactly once: a second settlement of the same reservation is refused.
  assert.equal(await port.quota.settle(reserved.id, { analysisStatus: 'completed' }, NOW + 2_000), false);
  assert.equal((await port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START }))!.completedCount, 1);
});

test('limited settlement releases the unit without consuming quota', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  const reserved = await port.quota.reserve(reservation());
  assert.ok(reserved);

  assert.equal(await port.quota.settle(reserved.id, { analysisStatus: 'limited' }, NOW + 1_000), true);
  const bucket = await port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.ok(bucket);
  assert.equal(bucket.completedCount, 0);
  assert.equal(bucket.reservedCount, 0);
  const record = await port.quota.reservationByRequestKey('request-1');
  assert.equal(record?.state, 'released');
});

test('uncertain spend on a non-completed result is refused, then reconciled', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  const reserved = await port.quota.reserve(reservation({
    budget: {
      bucket: { budgetKey: 'monthly-provider', periodStart: MONTH_START },
      periodEnd: MONTH_END,
      currency: 'USD',
      limitAmount: 15,
      reservedAmount: 0.05,
    },
  }));
  assert.ok(reserved);
  assert.equal(reserved.budgetBucketId !== null, true);

  // No reported charge on a limited result: the caller must reconcile, not guess.
  assert.equal(await port.quota.settle(reserved.id, { analysisStatus: 'limited' }, NOW + 1_000), false);
  assert.equal((await port.quota.reservationByRequestKey('request-1'))?.state, 'reserved');

  assert.equal(await port.quota.markReconciliationRequired(reserved.id, 'limited', NOW + 2_000), true);
  assert.equal((await port.quota.reservationByRequestKey('request-1'))?.state, 'reconciliation_required');
  assert.equal(await port.quota.markReconciliationRequired(reserved.id, 'limited', NOW + 3_000), false);
  // Finalisation closes only the spend; quota was already settled at mark time.
  assert.equal(await port.quota.finalizeReconciliation(reserved.id, 0.03, NOW + 4_000), true);
  assert.equal((await port.quota.reservationByRequestKey('request-1'))?.state, 'released');
});

test('account deletion (direction c) removes user-linked quota/reservations, keeps budget totals', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  const reserved = await port.quota.reserve(reservation());
  assert.ok(reserved);
  await port.quota.settle(reserved.id, { analysisStatus: 'completed' }, NOW + 1_000);
  await port.checks.save(checkInput());
  await port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW,
  });

  const counts = await port.deleteSubject('subject-a');
  assert.deepEqual(counts, { checks: 1, history: 1, feedback: 1, quotaBuckets: 2, reservations: 1 });
  assert.equal(await port.checks.getOwned('check-1', 'subject-a', NOW), null);
  assert.deepEqual(await port.history.listOwned('subject-a', NOW), []);

  // User-linked quota buckets are removed under direction (c).
  assert.equal(await port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START }), null);
});

test('purgeExpired removes expired checks with their dependent rows', async () => {
  const port = createAsyncPersistence(createInMemoryPersistence());
  await port.checks.save(checkInput({
    checkId: 'check-expired', createdAt: NOW - 40 * DAY_MS, expiresAt: NOW - DAY_MS,
  }));
  await port.checks.save(checkInput({ checkId: 'check-live' }));

  assert.equal(await port.checks.purgeExpired(NOW), 1);
  assert.equal(await port.checks.getOwned('check-expired', 'subject-a', NOW - 40 * DAY_MS), null);
  assert.ok(await port.checks.getOwned('check-live', 'subject-a', NOW));
});

test('transaction function names match the recorded draft contract', () => {
  assert.deepEqual(Object.values(M4_TRANSACTION_FUNCTIONS).sort(), [
    'm4_delete_subject',
    'm4_finalize_reconciliation',
    'm4_mark_reconciliation',
    'm4_purge_expired',
    'm4_reserve_check',
    'm4_save_check',
    'm4_settle_reservation',
  ]);
});
