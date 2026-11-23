import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyHandler } from './netlify-handler.ts';
import { createCheckService } from './check-service.ts';
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
