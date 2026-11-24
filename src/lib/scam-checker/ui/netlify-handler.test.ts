import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyHandler } from './netlify-handler.ts';
import { createCheckService } from './check-service.ts';
import { createAsyncPersistence } from '../boundary/durable-persistence.ts';
import { createInMemoryPersistence } from '../boundary/persistence-port.ts';
import type { StoredHistoryEntry } from '../boundary/persistence-port.ts';
import type { M2SubscriptionDecision } from '../boundary/m2-entitlement-adapter.ts';

const FIXTURE = 'Your bank account will be suspended. Verify your password at https://verify.example/login';

/** A verified, entitled caller — the only shape that reaches the pipeline. */
const ALLOWED: M2SubscriptionDecision = {
  kind: 'verified',
  user: { id: 'user-1' },
  entitlement: {
    canRunCheck: true,
    reason: 'valid_entitlement',
    planId: 'sentinel',
    status: 'trialing',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
};

const DENIED: M2SubscriptionDecision = {
  kind: 'verified',
  user: { id: 'user-1' },
  entitlement: {
    canRunCheck: false,
    reason: 'subscription_required',
    planId: 'sentinel',
    status: 'active',
    expiresAt: '2020-01-01T00:00:00.000Z',
  },
};

const allowedResolver = async (): Promise<M2SubscriptionDecision> => ALLOWED;

function post(headers: Record<string, string>, body: unknown = { text: FIXTURE }): Request {
  return new Request('https://demo.netlify.app/api/check', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

/** Counts how many times the pipeline was entered — a refusal must never reach it. */
function countingService(): { service: ReturnType<typeof createCheckService>; calls: () => number } {
  const service = createCheckService();
  let count = 0;
  return {
    service: { ...service, check: async (text, sender) => { count += 1; return service.check(text, sender); } },
    calls: () => count,
  };
}

test('hosted API accepts HTTPS same-origin checks and uses the real pipeline', async () => {
  const secret = 'test-server-secret';
  const handler = createNetlifyHandler(createCheckService({
    live: { apiKey: secret, baseUrl: 'https://provider.invalid/v1', model: 'test-model' },
    provider: { analyze: async () => ({ kind: 'ok', json: {
      verdict: 'Suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft',
      reason: 'Requests a password under threat of suspension.',
    } }) },
  }), { resolveDecision: allowedResolver });
  const response = await handler(new Request('https://demo.netlify.app/api/check', {
    method: 'POST',
    headers: { origin: 'https://demo.netlify.app', 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({ text: FIXTURE, provider: 'fake' }),
  }));
  assert.equal(response.status, 200);
  const raw = await response.text();
  const body = JSON.parse(raw);
  assert.equal(body.outcome.analysisStatus, 'completed');
  assert.ok(body.outcome.rules.matches.length > 0);
  assert.equal(body.providerMode, 'live');
  assert.equal(raw.includes(secret), false);
});

test('hosted API rejects cross-origin, malformed and oversized bodies before calling the provider', async () => {
  const { service, calls } = countingService();
  const handler = createNetlifyHandler(service, { resolveDecision: allowedResolver });
  for (const [headers, body, status] of [
    [{ origin: 'https://evil.example', 'content-type': 'application/json' }, '{}', 403],
    [{ 'content-type': 'text/plain' }, '{}', 415],
    [{ 'content-type': 'application/json' }, '{broken', 400],
    [{ 'content-type': 'application/json' }, '[]', 400],
    [{ 'content-type': 'application/json' }, JSON.stringify({ text: 'x'.repeat(65536) }), 400],
  ] as const) {
    const response = await handler(new Request('https://demo.netlify.app/api/check', { method: 'POST', headers, body }));
    assert.equal(response.status, status);
  }
  assert.equal(calls(), 0);
});

test('hosted API reports configuration, routing and unconfigured AI honestly', async () => {
  const handler = createNetlifyHandler(createCheckService(), { resolveDecision: allowedResolver });
  const config = await handler(new Request('https://demo.netlify.app/api/config'));
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.equal((await config.json()).liveConfigured, false);
  assert.equal((await handler(new Request('https://demo.netlify.app/api/check'))).status, 405);
  assert.equal((await handler(new Request('https://demo.netlify.app/api/unknown'))).status, 404);
  const response = await handler(post({ authorization: 'Bearer test-token' }));
  assert.equal((await response.json()).outcome.analysisStatus, 'limited');
});

test('a check without an Authorization header is refused before the provider', async () => {
  const { service, calls } = countingService();
  const handler = createNetlifyHandler(service, { resolveDecision: allowedResolver });

  const response = await handler(post({}));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'sign-in-required' });
  assert.equal(calls(), 0, 'no header must never reach the pipeline');
});

test('a token Supabase will not verify is refused as sign-in-required', async () => {
  const { service, calls } = countingService();
  const handler = createNetlifyHandler(service, {
    resolveDecision: async () => ({ kind: 'unauthenticated' } as M2SubscriptionDecision),
  });

  const response = await handler(post({ authorization: 'Bearer bogus' }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'sign-in-required' });
  assert.equal(calls(), 0);
});

test('a verified caller without an entitlement is refused with 403', async () => {
  const { service, calls } = countingService();
  const handler = createNetlifyHandler(service, { resolveDecision: async () => DENIED });

  const response = await handler(post({ authorization: 'Bearer real-token' }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'access-blocked' });
  assert.equal(calls(), 0);
});

test('an unavailable access check fails closed with 503, as does a throwing resolver', async () => {
  const { service, calls } = countingService();
  const unavailable = createNetlifyHandler(service, {
    resolveDecision: async () => ({ kind: 'unavailable' } as M2SubscriptionDecision),
  });
  const throwing = createNetlifyHandler(service, {
    resolveDecision: async () => { throw new Error('supabase down'); },
  });

  for (const handler of [unavailable, throwing]) {
    const response = await handler(post({ authorization: 'Bearer real-token' }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'access-unavailable' });
  }
  assert.equal(calls(), 0);
});

test('an entitled caller reaches the pipeline exactly once', async () => {
  const { service, calls } = countingService();
  const handler = createNetlifyHandler(service, { resolveDecision: allowedResolver });

  const response = await handler(post({ authorization: 'Bearer real-token' }));
  assert.equal(response.status, 200);
  assert.equal(calls(), 1);
});

// --- M4-08 history read route -------------------------------------------------------------

const HISTORY_SUBJECT = '11111111-1111-4111-8111-111111111111';
const HISTORY_ENTRY: StoredHistoryEntry = {
  id: 'history-1', checkId: 'chk-1', subjectKey: HISTORY_SUBJECT, planId: 'sentinel',
  createdAt: 1_700_000_000_000, expiresAt: 4_000_000_000_000, snippet: 'Verify your password',
  verdictLabel: 'suspicious', category: 'phishing',
};

function historyGet(headers: Record<string, string> = { authorization: 'Bearer t' }): Request {
  return new Request('https://demo.netlify.app/api/history', { method: 'GET', headers });
}

function historyReader() {
  const asked: string[] = [];
  return {
    asked,
    history: { listOwned: async (subjectKey: string): Promise<StoredHistoryEntry[]> => { asked.push(subjectKey); return [HISTORY_ENTRY]; } },
  };
}

test('GET /api/history without an Authorization header is refused before resolution', async () => {
  const { history, asked } = historyReader();
  const handler = createNetlifyHandler(createCheckService(), { resolveDecision: allowedResolver, history });
  const response = await handler(historyGet({}));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'sign-in-required' });
  assert.deepEqual(asked, []);
});

test('GET /api/history returns full access and own rows for an active caller', async () => {
  const { history, asked } = historyReader();
  const handler = createNetlifyHandler(createCheckService(), {
    resolveDecision: async () => ({ kind: 'verified', user: { id: HISTORY_SUBJECT }, entitlement: { canRunCheck: true, planId: 'sentinel', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z' } }),
    history,
  });
  const response = await handler(historyGet());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.access, 'full');
  assert.deepEqual(body.entries, [HISTORY_ENTRY]);
  assert.deepEqual(asked, [HISTORY_SUBJECT]);
});

test('GET /api/history is read-only for an expired caller, not a denial', async () => {
  const { history } = historyReader();
  const handler = createNetlifyHandler(createCheckService(), {
    resolveDecision: async () => ({ kind: 'verified', user: { id: HISTORY_SUBJECT }, entitlement: { canRunCheck: true, planId: 'sentinel', status: 'active', expiresAt: '2020-01-01T00:00:00.000Z' } }),
    history,
  });
  const response = await handler(historyGet());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).access, 'read-only');
});

test('GET /api/history fails closed for unauthenticated, unavailable and unentitled callers', async () => {
  const { history, asked } = historyReader();
  const noEntitlement: M2SubscriptionDecision = {
    kind: 'verified', user: { id: HISTORY_SUBJECT },
    entitlement: { canRunCheck: false, reason: 'subscription_required', planId: null, status: null, expiresAt: null },
  };
  const unauth = createNetlifyHandler(createCheckService(), { resolveDecision: async () => ({ kind: 'unauthenticated' }), history });
  const unavailable = createNetlifyHandler(createCheckService(), { resolveDecision: async () => ({ kind: 'unavailable' }), history });
  const denied = createNetlifyHandler(createCheckService(), { resolveDecision: async () => noEntitlement, history });
  assert.equal((await unauth(historyGet())).status, 401);
  assert.equal((await unavailable(historyGet())).status, 503);
  assert.equal((await denied(historyGet())).status, 403);
  assert.deepEqual(asked, [], 'a refusal never reads the store');
});

test('GET /api/history keeps an expired denied caller read-only, not refused', async () => {
  const { history } = historyReader();
  const handler = createNetlifyHandler(createCheckService(), { resolveDecision: async () => DENIED, history });
  const response = await handler(historyGet());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).access, 'read-only');
});

test('POST /api/history is method-not-allowed', async () => {
  const handler = createNetlifyHandler(createCheckService(), { resolveDecision: allowedResolver });
  const response = await handler(new Request('https://demo.netlify.app/api/history', { method: 'POST', headers: { authorization: 'Bearer t' } }));
  assert.equal(response.status, 405);
});

// --- M4-08 write-side subject wiring (end-to-end, in memory) -------------------------------

test('a verified uuid caller persists a completed check and reads it back via /api/history', async () => {
  const UUID = '22222222-2222-4222-8222-222222222222';
  const persistence = createAsyncPersistence(createInMemoryPersistence());
  const decision: M2SubscriptionDecision = {
    kind: 'verified', user: { id: UUID },
    entitlement: { canRunCheck: true, reason: 'valid_entitlement', planId: 'sentinel', status: 'trialing', expiresAt: '2099-01-01T00:00:00.000Z' },
  };
  const service = createCheckService({
    live: { apiKey: 'k', baseUrl: 'https://provider.invalid/v1', model: 'm' },
    provider: { analyze: async () => ({ kind: 'ok', json: { verdict: 'Suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft', reason: 'Requests a password under threat of suspension.' } }) },
    persistence,
  });
  const handler = createNetlifyHandler(service, { resolveDecision: async () => decision, history: persistence.history });

  const check = await handler(post({ authorization: 'Bearer t' }));
  assert.equal(check.status, 200);
  const checkBody = await check.json();
  assert.equal(checkBody.outcome.analysisStatus, 'completed');
  assert.ok(typeof checkBody.persistedCheckId === 'string' && checkBody.persistedCheckId.length > 0, 'a verified uuid completed check is persisted');

  const hist = await handler(historyGet());
  assert.equal(hist.status, 200);
  const histBody = await hist.json();
  assert.equal(histBody.access, 'full');
  assert.equal(histBody.entries.length, 1);
  assert.equal(histBody.entries[0].checkId, checkBody.persistedCheckId);
  assert.equal(histBody.entries[0].subjectKey, UUID);
});

test('history is subject-isolated: a different verified caller sees no rows', async () => {
  const UUID = '33333333-3333-4333-8333-333333333333';
  const OTHER = '44444444-4444-4444-8444-444444444444';
  const persistence = createAsyncPersistence(createInMemoryPersistence());
  const service = createCheckService({
    live: { apiKey: 'k', baseUrl: 'https://provider.invalid/v1', model: 'm' },
    provider: { analyze: async () => ({ kind: 'ok', json: { verdict: 'Suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft', reason: 'Requests a password.' } }) },
    persistence,
  });
  const decisionFor = (id: string): M2SubscriptionDecision => ({
    kind: 'verified', user: { id },
    entitlement: { canRunCheck: true, planId: 'sentinel', status: 'trialing', expiresAt: '2099-01-01T00:00:00.000Z' },
  });
  const writer = createNetlifyHandler(service, { resolveDecision: async () => decisionFor(UUID), history: persistence.history });
  await writer(post({ authorization: 'Bearer t' }));

  const reader = createNetlifyHandler(service, { resolveDecision: async () => decisionFor(OTHER), history: persistence.history });
  const hist = await reader(historyGet());
  assert.equal(hist.status, 200);
  assert.deepEqual((await hist.json()).entries, [], 'a foreign subject never sees another user’s rows');
});
