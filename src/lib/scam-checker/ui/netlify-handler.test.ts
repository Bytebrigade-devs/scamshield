import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyHandler } from './netlify-handler.ts';
import { createCheckService } from './check-service.ts';

const FIXTURE = 'Your bank account will be suspended. Verify your password at https://verify.example/login';

test('hosted API accepts HTTPS same-origin checks and uses the real pipeline', async () => {
  const secret = 'test-server-secret';
  const handler = createNetlifyHandler(createCheckService({
    live: { apiKey: secret, baseUrl: 'https://provider.invalid/v1', model: 'test-model' },
    provider: { analyze: async () => ({ kind: 'ok', json: {
      verdict: 'Suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft',
      reason: 'Requests a password under threat of suspension.',
    } }) },
  }));
  const response = await handler(new Request('https://demo.netlify.app/api/check', {
    method: 'POST', headers: { origin: 'https://demo.netlify.app', 'content-type': 'application/json' },
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
  let calls = 0;
  const service = createCheckService();
  const handler = createNetlifyHandler({ ...service, check: async (text) => { calls++; return service.check(text); } });
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
  assert.equal(calls, 0);
});

test('hosted API reports configuration, routing and unconfigured AI honestly', async () => {
  const handler = createNetlifyHandler(createCheckService());
  const config = await handler(new Request('https://demo.netlify.app/api/config'));
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.equal((await config.json()).liveConfigured, false);
  assert.equal((await handler(new Request('https://demo.netlify.app/api/check'))).status, 405);
  assert.equal((await handler(new Request('https://demo.netlify.app/api/unknown'))).status, 404);
  const response = await handler(new Request('https://demo.netlify.app/api/check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: FIXTURE }),
  }));
  assert.equal((await response.json()).outcome.analysisStatus, 'limited');
});
