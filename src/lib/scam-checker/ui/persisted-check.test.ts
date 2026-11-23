/**
 * M4 — durable check persistence tests.
 *
 * Proves the write path the durable store exists for: a completed analysis under a verified
 * uuid subject stores the check **and** its history row; a demo-string subject stores neither;
 * a failing store leaves the analysed result intact and reports why (owner decision 24 Nov 2026).
 *
 * The "durable" double here is the real async wrapper over the in-memory port, so the mapping is
 * exercised through the same interface the PostgREST adapter implements.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCheckService } from './check-service.ts';
import { persistCompletedCheck, type AnalysedOutcome } from './persisted-check.ts';
import { createInMemoryPersistence } from '../boundary/persistence-port.ts';
import { createAsyncPersistence, type DurablePersistence } from '../boundary/durable-persistence.ts';
import type { ProviderPort } from '../boundary/check-boundary.ts';

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const USER = '11111111-1111-4111-8111-111111111111';
const FIXTURE = 'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';
const LIVE = { apiKey: 'synthetic-service-key', baseUrl: 'https://provider.invalid/v1', model: 'test-model' };
const REPLY = { verdict: 'Potentially suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft', reason: 'Pressure and a request for credentials.' };
const completed: ProviderPort = { analyze: async () => ({ kind: 'ok', json: REPLY }) };

function outcome(): AnalysedOutcome {
  return {
    kind: 'analysed',
    analysisStatus: 'completed',
    analysisMode: 'rules_and_ai',
    category: 'phishing',
    candidates: { urls: [], emails: [], phones: [] },
    rules: { matches: [{ ruleId: 'R-M4-14', excerpt: 'clearance fee', start: 10, end: 23, contextNote: 'parcel-demand' }] },
    reply: {
      verdictLabel: 'potentially suspicious', category: 'phishing',
      reason: 'Pressure and a request for credentials.', riskLevel: 'suspicious', reasonHighlights: [],
    },
    limitations: [],
  };
}

function durable(): DurablePersistence {
  return createAsyncPersistence(createInMemoryPersistence());
}

test('a completed outcome under a verified subject stores the check and its history', async () => {
  const store = durable();
  const result = await persistCompletedCheck({
    persistence: store, checkId: 'chk-1', subjectKey: USER, planId: 'sentinel',
    entitlementExpiresAt: NOW + 86_400_000, text: FIXTURE, outcome: outcome(), now: NOW,
  });
  assert.deepEqual(result, { ok: true, checkId: 'chk-1' });

  const stored = await store.checks.getOwned('chk-1', USER, NOW);
  assert.ok(stored);
  assert.equal(stored.categoryId, 'phishing');
  assert.equal(stored.findings.length, 1, 'rule evidence is stored as findings');
  assert.equal(stored.findings[0]!.ruleId, 'R-M4-14');
  assert.ok(stored.historyId !== null, 'the history row is written in the same call');

  const history = await store.history.listOwned(USER, NOW);
  assert.equal(history.length, 1);
  assert.ok(history[0]!.snippet.length > 0);
});

test('every refusal returns a reason instead of throwing', async () => {
  const base = {
    persistence: durable(), checkId: 'chk-2', planId: 'sentinel',
    entitlementExpiresAt: NOW + 86_400_000, text: FIXTURE, now: NOW,
  } as const;

  assert.equal((await persistCompletedCheck({ ...base, subjectKey: 'local-ui-demo-subject', outcome: outcome() })).ok, false);
  assert.equal((await persistCompletedCheck({ ...base, subjectKey: USER, planId: 'free', outcome: outcome() })).ok, false, 'unknown plan has no retention');
  const incomplete = { ...outcome(), analysisStatus: 'limited', analysisMode: 'rules_only', reply: null } as unknown as AnalysedOutcome;
  assert.equal((await persistCompletedCheck({ ...base, subjectKey: USER, outcome: incomplete })).ok, false);
});

test('a store that refuses or throws yields a reason, never an exception', async () => {
  const refusing: DurablePersistence = { ...durable(), checks: { ...durable().checks, save: async () => null } } as DurablePersistence;
  const throwing: DurablePersistence = { ...durable(), checks: { ...durable().checks, save: async () => { throw new Error('boom'); } } } as DurablePersistence;

  for (const persistence of [refusing, throwing]) {
    const result = await persistCompletedCheck({
      persistence, checkId: 'chk-3', subjectKey: USER, planId: 'sentinel',
      entitlementExpiresAt: NOW + 86_400_000, text: FIXTURE, outcome: outcome(), now: NOW,
    });
    assert.equal(result.ok, false);
  }
});

test('the service persists a completed check under a uuid subject, and emits the event for it', async () => {
  const store = durable();
  const service = createCheckService({ live: LIVE, provider: completed, persistence: store, now: () => NOW });
  const result = await service.check(FIXTURE, undefined, { subjectKey: USER, planId: 'sentinel', entitlementExpiresAt: NOW + 86_400_000 });

  assert.equal(result.outcome.kind, 'analysed');
  assert.ok(result.persistedCheckId, 'the check id is returned so feedback can reference it');
  assert.equal(result.persistenceFailure, undefined);

  const stored = await store.checks.getOwned(result.persistedCheckId!, USER, NOW);
  assert.ok(stored, 'the row really exists under the verified subject');

  const events = await service.listEvents();
  assert.equal(events.length, 1);
  assert.equal((events[0] as { subject_ref?: string }).subject_ref, USER, 'the event names the verified subject');
});

test('the demo subject persists an event only — no check, no history', async () => {
  const store = durable();
  const service = createCheckService({ live: LIVE, provider: completed, persistence: store, now: () => NOW });
  const result = await service.check(FIXTURE);

  assert.equal(result.persistedCheckId, undefined);
  assert.equal(result.persistenceFailure, undefined, 'nothing was attempted, so nothing failed');
  const events = await service.listEvents();
  assert.equal(events.length, 1);
  assert.equal((events[0] as { subject_ref?: string }).subject_ref, 'local-ui-demo-subject');
});

test('a failing durable write keeps the analysed result and reports the failure', async () => {
  const base = durable();
  const broken: DurablePersistence = { ...base, checks: { ...base.checks, save: async () => { throw new Error('store down'); } } } as DurablePersistence;
  const service = createCheckService({ live: LIVE, provider: completed, persistence: broken, now: () => NOW });
  const result = await service.check(FIXTURE, undefined, { subjectKey: USER, planId: 'sentinel', entitlementExpiresAt: NOW + 86_400_000 });

  assert.equal(result.outcome.kind, 'analysed', 'the answer the caller paid for is not discarded');
  assert.equal(result.persistedCheckId, undefined);
  assert.equal(result.persistenceFailure, 'store down');
});
