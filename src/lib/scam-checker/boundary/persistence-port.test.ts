/**
 * M4 — persistence port tests.
 *
 * Pins the recorded storage semantics: own-row reads, retention hiding/purging with
 * dependent-row cascade, exactly-once quota settlement where ONLY completed analyses consume
 * quota (limited/unavailable release), reconciliation for uncertain spend, idempotent event
 * append, and the eight-field event allowlist. In-memory only: no database, network or env.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInMemoryPersistence, MAX_HIGHLIGHTS,
  type QuotaReservationInput, type StoredCheckInput,
} from './persistence-port.ts';
import { EVENT_CONTRACT_VERSION, EVENT_TYPE, type CheckOutcomeEvent } from './x13-event.ts';
import { TAXONOMY_VERSION } from './taxonomy.ts';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0); // 19 Nov 2026 12:00 UTC
const DAY_START = Date.UTC(2026, 10, 19);
const MONTH_START = Date.UTC(2026, 10, 1);
const MONTH_END = Date.UTC(2026, 11, 1);

function input(overrides: Partial<StoredCheckInput> = {}): StoredCheckInput {
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
    dailyBucket: { periodKind: 'daily', periodStart: DAY_START, periodEnd: DAY_START + DAY_MS },
    allowanceBucket: { periodKind: 'monthly', periodStart: MONTH_START, periodEnd: MONTH_END },
    ...overrides,
  };
}

test('save: writes check, findings and history atomically; own reads only', () => {
  const port = createInMemoryPersistence();
  const saved = port.checks.save(input());
  assert.ok(saved);
  assert.equal(saved.findings.length, 1);
  assert.equal(saved.findings[0].checkId, 'check-1');
  assert.ok(saved.historyId);

  const own = port.checks.getOwned('check-1', 'subject-a', NOW);
  assert.ok(own);
  assert.equal(own.categoryId, 'phishing');
  assert.equal(port.checks.getOwned('check-1', 'subject-b', NOW), null, 'no cross-subject read');

  const history = port.history.listOwned('subject-a', NOW);
  assert.equal(history.length, 1);
  assert.equal(history[0].checkId, 'check-1');
  assert.equal(history[0].verdictLabel, 'suspicious');
  assert.equal(port.history.listOwned('subject-b', NOW).length, 0, 'history is owner-scoped');
});

test('save: rejects invalid input and duplicate check ids', () => {
  const port = createInMemoryPersistence();
  assert.ok(port.checks.save(input()));
  assert.equal(port.checks.save(input()), null, 'check id is unique');

  assert.equal(port.checks.save(input({
    checkId: 'check-2',
    analysisStatus: 'completed',
    analysisMode: 'rules_only', // invalid pair
  })), null);
  assert.equal(port.checks.save(input({
    checkId: 'check-3',
    reasonHighlights: Array.from({ length: MAX_HIGHLIGHTS + 1 }, (_, i) => ({ start: i, end: i + 1, excerpt: 'x' })),
  })), null);
  assert.equal(port.checks.save(input({ checkId: 'check-4', history: { snippet: '   ', verdictLabel: 'suspicious' } })), null);
  assert.equal(port.checks.save(input({ checkId: 'check-5', categoryId: 'not_a_category' as never })), null);
});

test('retention: expired rows are hidden, then purged with dependents', () => {
  const port = createInMemoryPersistence();
  port.checks.save(input({ checkId: 'short-1', expiresAt: NOW + 1_000 }));
  assert.ok(port.feedback.save({
    subjectKey: 'subject-a', checkId: 'short-1', category: 'phishing',
    reasonCode: 'wrong_category', createdAt: NOW,
  }));
  assert.ok(port.checks.getOwned('short-1', 'subject-a', NOW));
  assert.equal(port.checks.getOwned('short-1', 'subject-a', NOW + 2_000), null, 'expired check hidden');
  assert.equal(port.history.listOwned('subject-a', NOW + 2_000).length, 0, 'expired history hidden');

  assert.equal(port.checks.purgeExpired(NOW + 2_000), 1);
  assert.equal(port.history.listOwned('subject-a', NOW).length, 0, 'history cascaded');
  assert.equal(port.feedback.listOwned('subject-a').length, 0, 'feedback cascaded with check expiry');
});

test('feedback: one row per owned check, upsert replaces the prior record', () => {
  const port = createInMemoryPersistence();
  port.checks.save(input());
  const first = port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'wrong_category', createdAt: NOW,
  });
  assert.ok(first);
  const second = port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW + 1_000,
  });
  assert.ok(second);
  assert.equal(second.id, first!.id, 'idempotent id');
  const list = port.feedback.listOwned('subject-a');
  assert.equal(list.length, 1, 'never two rows for the same subject + check');
  assert.equal(list[0].reasonCode, 'false_alarm');

  assert.equal(port.feedback.save({
    subjectKey: 'subject-b', checkId: 'check-1', category: 'phishing',
    reasonCode: 'wrong_category', createdAt: NOW,
  }), null, 'feedback requires an owned check');
});

test('deleteCheck: enforces ownership and cascades findings, history and feedback', () => {
  const port = createInMemoryPersistence();
  port.checks.save(input());
  port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'wrong_category', createdAt: NOW,
  });
  assert.equal(port.checks.deleteCheck('check-1', 'subject-b'), false, 'foreign delete refused');
  assert.equal(port.checks.deleteCheck('check-1', 'subject-a'), true);
  assert.equal(port.checks.getOwned('check-1', 'subject-a', NOW), null);
  assert.equal(port.history.listOwned('subject-a', NOW).length, 0);
  assert.equal(port.feedback.listOwned('subject-a').length, 0);
});

test('deleteSubject: removes all of a subject’s rows and never resets quota counters', () => {
  const port = createInMemoryPersistence();
  port.checks.save(input());
  port.checks.save(input({ checkId: 'check-2' }));
  port.feedback.save({
    subjectKey: 'subject-a', checkId: 'check-1', category: 'phishing',
    reasonCode: 'wrong_category', createdAt: NOW,
  });
  const record = port.quota.reserve(reservation());
  assert.ok(record);

  const deleted = port.deleteSubject('subject-a');
  assert.equal(deleted.checks, 2);
  assert.equal(deleted.history, 2);
  assert.equal(deleted.feedback, 1);
  assert.equal(port.history.listOwned('subject-a', NOW).length, 0);

  const bucket = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.equal(bucket?.reservedCount, 1, 'deletion must not reset quota counters');
});

test('quota: a completed analysis converts its reservation exactly once', () => {
  const port = createInMemoryPersistence();
  const record = port.quota.reserve(reservation());
  assert.ok(record);
  const daily = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START });
  const monthly = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.equal(daily?.reservedCount, 1);
  assert.equal(monthly?.reservedCount, 1);

  assert.equal(port.quota.settle(record.id, { analysisStatus: 'completed' }, NOW + 1_000), true);
  assert.equal(port.quota.settle(record.id, { analysisStatus: 'completed' }, NOW + 2_000), false, 'exactly once');

  const afterDaily = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START });
  const afterMonthly = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.equal(afterDaily?.completedCount, 1);
  assert.equal(afterMonthly?.completedCount, 1);
  assert.equal(afterDaily?.reservedCount, 0);
  assert.equal(afterMonthly?.reservedCount, 0);
});

test('quota: limited and unavailable release their reservations without counting', () => {
  const port = createInMemoryPersistence();
  const limited = port.quota.reserve(reservation({ requestKey: 'request-limited' }));
  const unavailable = port.quota.reserve(reservation({ requestKey: 'request-unavailable' }));
  assert.ok(limited && unavailable);

  assert.equal(port.quota.settle(limited.id, { analysisStatus: 'limited' }, NOW + 1_000), true);
  assert.equal(port.quota.settle(unavailable.id, { analysisStatus: 'unavailable' }, NOW + 1_000), true);

  const daily = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START });
  const monthly = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.equal(daily?.completedCount, 0, 'limited/unavailable never consume quota');
  assert.equal(monthly?.completedCount, 0);
  assert.equal(daily?.reservedCount, 0);
  assert.equal(monthly?.reservedCount, 0);
});

test('quota: a limited attempt with an unknown provider charge must use reconciliation', () => {
  const port = createInMemoryPersistence();
  const record = port.quota.reserve(reservation({
    requestKey: 'request-unknown-spend',
    budget: {
      bucket: { budgetKey: 'openai-nov-2026', periodStart: MONTH_START },
      periodEnd: MONTH_END,
      currency: 'USD',
      limitAmount: 15,
      reservedAmount: 0.1,
    },
  }));
  assert.ok(record);
  assert.equal(port.quota.settle(record.id, { analysisStatus: 'limited' }, NOW + 1_000), false,
    'an unreported charge cannot be settled blindly');
  const monthly = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.equal(monthly?.reservedCount, 1, 'nothing committed when settlement is refused');
  const budget = port.budget.getBucket({ budgetKey: 'openai-nov-2026', periodStart: MONTH_START });
  assert.equal(budget?.reservedAmount, 0.1, 'spend reservation retained for reconciliation');
  assert.equal(port.quota.markReconciliationRequired(record.id, NOW + 2_000), true);
});

test('quota: a limited attempt can still charge provider spend without consuming quota', () => {
  const port = createInMemoryPersistence();
  const record = port.quota.reserve(reservation({
    requestKey: 'request-spend',
    budget: {
      bucket: { budgetKey: 'openai-nov-2026', periodStart: MONTH_START },
      periodEnd: MONTH_END,
      currency: 'USD',
      limitAmount: 15,
      reservedAmount: 0.1,
    },
  }));
  assert.ok(record);
  assert.equal(port.quota.settle(record.id, { analysisStatus: 'limited', actualSpend: 0.05 }, NOW + 1_000), true);

  const daily = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START });
  assert.equal(daily?.completedCount, 0);
  const budget = port.budget.getBucket({ budgetKey: 'openai-nov-2026', periodStart: MONTH_START });
  assert.equal(budget?.reservedAmount, 0);
  assert.equal(budget?.spentAmount, 0.05);
});

test('quota: reconciliation keeps an uncertain spend reservation instead of releasing it', () => {
  const port = createInMemoryPersistence();
  const record = port.quota.reserve(reservation({ requestKey: 'request-reconcile' }));
  assert.ok(record);
  assert.equal(port.quota.markReconciliationRequired(record.id, NOW + 1_000), true);
  assert.equal(port.quota.settle(record.id, { analysisStatus: 'completed' }, NOW + 2_000), false,
    'a reconciliation reservation cannot be settled blindly');
  const monthly = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'monthly', periodStart: MONTH_START });
  assert.equal(monthly?.completedCount, 0);
  assert.equal(monthly?.reservedCount, 1, 'quota stays reserved until reconciliation resolves it');
});

test('quota: request keys are idempotent and buckets are unique per period', () => {
  const port = createInMemoryPersistence();
  const first = port.quota.reserve(reservation());
  const second = port.quota.reserve(reservation());
  assert.ok(first && second);
  assert.equal(second.id, first.id, 'the same request key returns the same reservation');
  const daily = port.quota.getBucket({ subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START });
  assert.equal(daily?.reservedCount, 1, 'no double reservation');

  const bucketA = port.quota.getOrCreateBucket(
    { subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START, periodEnd: DAY_START + DAY_MS },
    NOW,
  );
  const bucketB = port.quota.getOrCreateBucket(
    { subjectKey: 'subject-a', periodKind: 'daily', periodStart: DAY_START, periodEnd: DAY_START + DAY_MS },
    NOW,
  );
  assert.equal(bucketA.id, bucketB.id, 'unique bucket per subject + kind + start');
});

test('events: idempotent identical duplicates, conflicting duplicates rejected, purge by time', () => {
  const port = createInMemoryPersistence();
  const base = event();
  assert.equal(port.events.append(base), true);
  assert.equal(port.events.append({ ...base }), true, 'identical duplicate is a no-op success');
  assert.equal(port.events.listAll().length, 1);

  const conflicting = { ...base, category_id: 'fake_invoice' as const };
  assert.equal(port.events.append(conflicting), false, 'same id with different content is rejected');
  assert.equal(port.events.listAll().length, 1);

  assert.equal(port.events.append(event({ event_id: 'event-2', occurred_at: '2026-11-18T10:00:00.000Z' })), true);
  assert.equal(port.events.purgeBefore(Date.parse('2026-11-19T00:00:00.000Z')), 1, 'purges only older events');
  assert.equal(port.events.listAll().length, 1);
});

test('events: the agreed 0.2.0-draft revision is stored with its reference (nine fields)', () => {
  const port = createInMemoryPersistence();
  const v2 = { ...event(), contract_version: '0.2.0-draft', subject_ref: 'subj-9f3a' } as unknown as CheckOutcomeEvent;
  assert.equal(port.events.append(v2), true);
  const [stored] = port.events.listAll();
  assert.equal((stored as { subject_ref?: string }).subject_ref, 'subj-9f3a');
  assert.equal(Object.keys(stored).length, 9);
  assert.equal(port.events.append({ ...v2 }), true, 'identical duplicate idempotent');
  assert.equal(port.events.append({ ...v2, category_id: 'fake_invoice' } as unknown as CheckOutcomeEvent), false, 'conflicting duplicate rejected');
  assert.equal(port.events.listAll().length, 1);
});

test('events: an invalid 0.2.0-draft reference is refused', () => {
  const port = createInMemoryPersistence();
  const bad = { ...event(), contract_version: '0.2.0-draft', subject_ref: 'user@example.com' } as unknown as CheckOutcomeEvent;
  assert.equal(port.events.append(bad), false);
  assert.equal(port.events.listAll().length, 0);
});

test('events: stored shape is exactly the eight allowlisted fields', () => {
  const port = createInMemoryPersistence();
  port.events.append(event());
  const [stored] = port.events.listAll();
  assert.deepEqual(
    Object.keys(stored).sort(),
    ['analysis_mode', 'analysis_status', 'category_id', 'contract_version', 'event_id',
      'event_type', 'occurred_at', 'taxonomy_version'],
  );
});
