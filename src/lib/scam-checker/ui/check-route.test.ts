import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCheckApiRoute } from './check-route.ts';
import { createCheckService } from './check-service.ts';
import { createFeedbackSupport } from './feedback-endpoint.ts';
import { createAsyncPersistence } from '../boundary/durable-persistence.ts';
import { createInMemoryPersistence } from '../boundary/persistence-port.ts';
import type { M2SubscriptionDecision } from '../boundary/m2-entitlement-adapter.ts';

const NOW = Date.parse('2026-11-24T00:00:00.000Z');
const UUID = '11111111-1111-4111-8111-111111111111';
const TEXT = 'Your bank account will be suspended. Verify your password at https://verify.example/login';

const ENTITLED: M2SubscriptionDecision = {
  kind: 'verified',
  user: { id: UUID },
  entitlement: {
    canRunCheck: true,
    reason: 'valid_entitlement',
    planId: 'sentinel',
    status: 'active',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
};

function completedService(persistence: ReturnType<typeof createAsyncPersistence>) {
  return createCheckService({
    now: () => NOW,
    live: { apiKey: 'k', baseUrl: 'https://provider.invalid/v1', model: 'm' },
    provider: { analyze: async () => ({ kind: 'ok', json: {
      verdict: 'Suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft',
      reason: 'Requests a password under threat of suspension.',
    } }) },
    persistence,
  });
}

function post(handler: (r: Request) => Promise<Response>, authorization?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authorization !== undefined) headers.authorization = authorization;
  return handler(new Request('https://demo.example/api/check', {
    method: 'POST', headers, body: JSON.stringify({ text: TEXT }),
  }));
}

test('a signed-in completed check forwards the verified subject and persists history (regression: full decision, not decision.entitlement)', async () => {
  const persistence = createAsyncPersistence(createInMemoryPersistence());
  const handler = createCheckApiRoute({
    service: completedService(persistence),
    feedback: createFeedbackSupport({ subjectKey: UUID }),
    resolveContext: async () => ENTITLED,
  });
  const response = await post(handler, 'Bearer test-token');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.outcome.analysisStatus, 'completed');
  assert.ok(typeof result.persistedCheckId === 'string' && result.persistedCheckId.length > 0,
    'a verified completed check must persist (context built from the FULL decision)');
  const rows = await persistence.history.listOwned(UUID, NOW);
  assert.equal(rows.length, 1, 'the signed-in user’s history row is written');
  assert.equal(rows[0].subjectKey, UUID);
});

test('an anonymous completed check persists no history (no verified subject)', async () => {
  const persistence = createAsyncPersistence(createInMemoryPersistence());
  const handler = createCheckApiRoute({
    service: completedService(persistence),
    feedback: createFeedbackSupport({ subjectKey: 'demo' }),
    resolveContext: async () => ENTITLED,
  });
  const response = await post(handler); // no Authorization header
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.outcome.analysisStatus, 'completed');
  assert.equal(result.persistedCheckId, undefined);
  assert.equal((await persistence.history.listOwned(UUID, NOW)).length, 0);
});