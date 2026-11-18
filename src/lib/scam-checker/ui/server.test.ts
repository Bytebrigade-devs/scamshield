/**
 * HTTP-level tests for routing, automatic analysis selection, usage protection and secrets.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createCheckService } from './check-service.ts';
import type { CheckService } from './check-service.ts';
import { createUiServer } from './server.ts';
import { EMPTY_INPUT_MESSAGE } from '../boundary/check-boundary.ts';

const FIXTURE = 'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';
const SENTINEL_KEY = 'sk-test-SENTINEL-MUST-NEVER-LEAK';
const LIVE = { apiKey: SENTINEL_KEY, baseUrl: 'https://provider.invalid/v1', model: 'test-model' };
const REPLY = { verdict: 'Potentially suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft', reason: 'A request for credentials under time pressure.' };

function completedService() {
  return createCheckService({ live: LIVE, provider: { analyze: async () => ({ kind: 'ok', json: REPLY }) } });
}

interface Harness {
  baseUrl: string;
  server: Server;
  service: CheckService;
}

const running: Server[] = [];

async function start(service: CheckService): Promise<Harness> {
  const server = createUiServer({ service });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  running.push(server);
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server, service };
}

after(async () => {
  await Promise.all(
    running.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function postCheck(baseUrl: string, body: unknown): Promise<{ status: number; json: any; raw: string }> {
  const response = await fetch(`${baseUrl}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  return { status: response.status, json: JSON.parse(raw), raw };
}

test('config endpoint reports capability without exposing credentials', async () => {
  const service = createCheckService({
    live: { apiKey: SENTINEL_KEY, baseUrl: 'https://example.invalid/v1', model: 'test-model' },
  });
  const { baseUrl } = await start(service);
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const raw = await response.text();
  assert.equal(raw.includes(SENTINEL_KEY), false);
  const json = JSON.parse(raw);
  assert.equal(json.liveConfigured, true);
  assert.equal(json.model, 'test-model');
  assert.equal('domainResearchProvider' in json, false);
  assert.equal(json.limits.inputCharCap, 2000);
  assert.equal(json.taxonomyVersion, '0.1.0-draft');
});

test('serves the UI shell with a restrictive content security policy', async () => {
  const { baseUrl } = await start(createCheckService());
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  const html = await response.text();
  assert.match(html, /ScamShield/);

  const head = await fetch(`${baseUrl}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.text()).length, 0);
});

test('check endpoint automatically uses configured AI and carries rules evidence', async () => {
  const { baseUrl } = await start(completedService());
  const { status, json, raw } = await postCheck(baseUrl, { text: FIXTURE });
  assert.equal(status, 200);
  assert.equal(json.providerMode, 'live');
  assert.equal(json.outcome.kind, 'analysed');
  assert.equal(json.outcome.analysisStatus, 'completed');
  assert.equal(json.outcome.analysisMode, 'rules_and_ai');
  assert.equal(json.outcome.category, 'phishing');
  assert.ok(json.outcome.rules.matches.length > 0);
  assert.ok(json.outcome.reply.verdictLabel.length > 0);
  assert.equal(raw.includes(SENTINEL_KEY), false);
});

test('check endpoint carries the limited and unavailable states honestly', async () => {
  const { baseUrl } = await start(createCheckService());
  const limited = await postCheck(baseUrl, { text: FIXTURE });
  assert.equal(limited.json.outcome.analysisStatus, 'limited');
  assert.equal(limited.json.outcome.analysisMode, 'rules_only');
  assert.equal(limited.json.outcome.reply, null);
  assert.ok(limited.json.outcome.limitations.length > 0);

  const failed = await start(createCheckService({ live: LIVE, provider: { analyze: async () => ({ kind: 'failed', failure: 'http-error' }) } }));
  const unavailable = await postCheck(failed.baseUrl, { text: FIXTURE });
  assert.equal(unavailable.json.outcome.analysisStatus, 'unavailable');
  assert.equal(unavailable.json.outcome.analysisMode, 'none');
  assert.equal(unavailable.json.outcome.category, 'unknown_other');
});

test('browser outcome overrides cannot turn unconfigured AI into a completion', async () => {
  const { baseUrl } = await start(createCheckService({ live: null }));
  for (const devOutcome of ['completed', 'live', 'rules-only', 'unavailable', 'unknown']) {
    const { json } = await postCheck(baseUrl, { text: FIXTURE, devOutcome });
    assert.equal(json.providerMode, 'live-unconfigured');
    assert.equal(json.outcome.analysisStatus, 'limited');
    assert.equal(json.outcome.analysisMode, 'rules_only');
  }
});

test('browser outcome overrides cannot disable configured AI', async () => {
  const { baseUrl } = await start(completedService());
  const { json } = await postCheck(baseUrl, { text: FIXTURE, devOutcome: 'rules-only', provider: null });
  assert.equal(json.providerMode, 'live');
  assert.equal(json.outcome.analysisStatus, 'completed');
});

test('empty input is rejected at the boundary, not in the browser alone', async () => {
  const { baseUrl } = await start(createCheckService());
  const { json } = await postCheck(baseUrl, { text: '   ' });
  assert.equal(json.outcome.kind, 'rejected');
  assert.equal(json.outcome.reason, 'invalid-input');
  assert.equal(json.outcome.message, EMPTY_INPUT_MESSAGE);
});

test('browser-supplied identifiers and unknown fields are inert', async () => {
  const service = createCheckService();
  const { baseUrl } = await start(service);
  const { json } = await postCheck(baseUrl, {
    text: FIXTURE,
    devOutcome: 'completed',
    session: { user: 'admin' },
    subjectKey: 'someone-else',
    planId: 'aegis',
    isAdmin: true,
    quota: 9999,
  });
  assert.equal(json.outcome.kind, 'analysed');
  // Unknown fields cannot grant access or choose an analysis outcome.
  const fallback = await postCheck(baseUrl, { text: FIXTURE, devOutcome: 'definitely-not-valid' });
  assert.equal(fallback.json.outcome.analysisStatus, 'limited');
});

test('removed reset endpoint cannot clear a burst denial', async () => {
  const fixed = 1_800_000_000_000;
  const service = createCheckService({ now: () => fixed });
  const { baseUrl } = await start(service);
  for (let i = 0; i < 5; i += 1) {
    const { json } = await postCheck(baseUrl, { text: FIXTURE, devOutcome: 'completed' });
    assert.equal(json.outcome.kind, 'analysed');
  }
  const denied = await postCheck(baseUrl, { text: FIXTURE, devOutcome: 'completed' });
  assert.equal(denied.json.outcome.reason, 'rate-denied');

  const reset = await fetch(`${baseUrl}/api/dev/reset`, { method: 'POST' });
  assert.equal(reset.status, 404);
  const stillDenied = await postCheck(baseUrl, { text: FIXTURE });
  assert.equal(stillDenied.json.outcome.kind, 'rejected');
  assert.equal(stillDenied.json.outcome.reason, 'rate-denied');
});

test('malformed requests are rejected without internals', async () => {
  const { baseUrl } = await start(createCheckService());
  const badJson = await fetch(`${baseUrl}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.text()).includes('SyntaxError'), false);

  const wrongMethod = await fetch(`${baseUrl}/api/check`);
  assert.equal(wrongMethod.status, 405);

  const unknownApi = await fetch(`${baseUrl}/api/nope`);
  assert.equal(unknownApi.status, 404);
});

test('static serving cannot escape the public directory', async () => {
  const { baseUrl } = await start(createCheckService());
  const traversal = await fetch(`${baseUrl}/..%2Fserver.ts`);
  assert.equal(traversal.status, 404);
  const nested = await fetch(`${baseUrl}/%2E%2E%2Fcheck-service.ts`);
  assert.equal(nested.status, 404);
});

test('foreign or malformed browser origins and non-JSON requests never reach usage or provider', async () => {
  let providerCalls = 0;
  const service = createCheckService({ live: LIVE, now: () => 1_800_000_000_000, provider: {
    analyze: async () => { providerCalls += 1; return { kind: 'ok', json: REPLY }; },
  } });
  const { baseUrl } = await start(service);
  for (const origin of ['https://attacker.invalid', 'null', 'not-an-origin', `${baseUrl}/path`]) {
    const response = await fetch(`${baseUrl}/api/check`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ text: FIXTURE }),
    });
    assert.equal(response.status, 403, origin);
    assert.deepEqual(await response.json(), { error: 'forbidden-origin' });
  }
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp']) {
    const response = await fetch(`${baseUrl}/api/check`, {
      method: 'POST',
      headers: { origin: baseUrl, 'content-type': contentType },
      body: JSON.stringify({ text: FIXTURE }),
    });
    assert.equal(response.status, 415, contentType);
  }
  assert.equal(providerCalls, 0);
  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(`${baseUrl}/api/check`, {
      method: 'POST',
      headers: { ...(i % 2 === 0 ? { origin: baseUrl } : {}), 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text: FIXTURE }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.outcome.analysisStatus, 'completed');
  }
  assert.equal(providerCalls, 5, 'rejected requests must not consume burst allowance');
  const denied = await postCheck(baseUrl, { text: FIXTURE });
  assert.equal(denied.json.outcome.reason, 'rate-denied');
});

test('malformed absolute request targets return 400 and the server remains usable', async () => {
  const { baseUrl } = await start(createCheckService());
  const address = new URL(baseUrl);
  const response = await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: address.hostname, port: Number(address.port) });
    let received = '';
    socket.setTimeout(1000, () => { socket.destroy(); resolve(received); });
    socket.on('connect', () => socket.write(`GET http://[ HTTP/1.1\r\nHost: ${address.host}\r\nConnection: close\r\n\r\n`));
    socket.on('data', (chunk) => { received += chunk.toString(); });
    socket.on('end', () => resolve(received));
    socket.on('error', reject);
  });
  assert.match(response, /^HTTP\/1\.1 400 /);
  assert.equal(response.includes('Invalid URL'), false);
  assert.equal((await fetch(`${baseUrl}/api/config`)).status, 200);
});

// ---- M4-15 edge cases (10 November 2026 addition) ----

test('M4-15/FS-M4-02: the 2,000-character cap holds through the HTTP path, with no truncation or provider call', async () => {
  const submitted: string[] = [];
  const service = createCheckService({ live: LIVE, provider: { analyze: async (text) => {
    submitted.push(text);
    return { kind: 'ok', json: REPLY };
  } } });
  const { baseUrl } = await start(service);

  const over = await postCheck(baseUrl, { text: 'x'.repeat(2_001) });
  assert.equal(over.status, 200, 'an over-cap submission is a handled rejection, not a transport failure');
  assert.equal(over.json.outcome.kind, 'rejected');
  assert.equal(over.json.outcome.reason, 'invalid-input');
  assert.match(over.json.outcome.message, /2,000/);
  assert.match(over.json.outcome.message, /edit or reduce/i);
  assert.deepEqual(submitted, [], 'over-cap input never reaches the provider');

  const atCap = 'x'.repeat(2_000);
  const accepted = await postCheck(baseUrl, { text: atCap });
  assert.equal(accepted.json.outcome.analysisStatus, 'completed');
  assert.deepEqual(submitted, [atCap], 'the accepted text is forwarded verbatim');
});

test('feedback: a completed check carries an opaque id; a report stores bounded fields only', async () => {
  const harness = await start(completedService());
  const check = await postCheck(harness.baseUrl, { text: FIXTURE });
  assert.equal(check.json.outcome.analysisStatus, 'completed');
  assert.ok(check.json.feedback?.checkId, 'an analysed check is reportable');
  assert.ok(Array.isArray(check.json.feedback.reasonCodes) && check.json.feedback.reasonCodes.length === 5);

  const origin = { 'content-type': 'application/json', origin: harness.baseUrl };
  const report = await fetch(`${harness.baseUrl}/api/feedback`, { method: 'POST', headers: origin, body: JSON.stringify({ checkId: check.json.feedback.checkId, reasonCode: 'missed_scam' }) });
  assert.equal(report.status, 200);
  assert.deepEqual(await report.json(), { accepted: true });

  // The rejected-input case carries no feedback option and can never be reported.
  const rejected = await postCheck(harness.baseUrl, { text: '   ' });
  assert.equal(rejected.json.outcome.kind, 'rejected');
  assert.equal(rejected.json.feedback, undefined);

  // Unknown and malformed reports fail closed with no storage.
  const unknown = await fetch(`${harness.baseUrl}/api/feedback`, { method: 'POST', headers: origin, body: JSON.stringify({ checkId: 'never-issued', reasonCode: 'other' }) });
  assert.equal(unknown.status, 404);
  const freeText = await fetch(`${harness.baseUrl}/api/feedback`, { method: 'POST', headers: origin, body: JSON.stringify({ checkId: check.json.feedback.checkId, reasonCode: 'free text' }) });
  assert.equal(freeText.status, 400);
  const crossOrigin = await fetch(`${harness.baseUrl}/api/feedback`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ checkId: 'x', reasonCode: 'other' }) });
  assert.equal(crossOrigin.status, 403);
  const wrongMethod = await fetch(`${harness.baseUrl}/api/feedback`);
  assert.equal(wrongMethod.status, 405);
});
