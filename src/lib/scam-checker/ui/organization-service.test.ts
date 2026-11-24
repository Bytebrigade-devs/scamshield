import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCheckRoute } from './check-route.ts';
import { createCheckService, DEMO_SUBJECT_KEY } from './check-service.ts';
import { createFeedbackSupport } from './feedback-endpoint.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';

const NOW = Date.UTC(2026, 9, 26, 6);
const TEXT = 'Sampath Bank: call 0112300260 or visit https://www.sampath.lk. Send your OTP immediately.';
const LIVE = { apiKey: 'test-secret', baseUrl: 'https://provider.invalid/v1', model: 'fixture' };
const REPLY = { verdict: 'High risk', category: 'phishing', taxonomy_version: '0.1.0-draft',
  reason: 'A matching official contact does not authenticate the sender. Never disclose an OTP.', risk_level: 'high' };

/** A verified, entitled caller: these tests exercise the pipeline, not admission. */
const entitled = async (): Promise<{ kind: string; user: { id: string }; entitlement: Record<string, unknown> }> => ({
  kind: 'verified',
  user: { id: 'test-user' },
  entitlement: {
    canRunCheck: true, reason: 'valid_entitlement',
    planId: 'sentinel', status: 'trialing', expiresAt: '2099-01-01T00:00:00.000Z',
  },
});

/** The app's `/api/check` transport, exercised without a bundler or a live host. */
const route = (service: ReturnType<typeof createCheckService>) =>
  createCheckRoute({ service, feedback: createFeedbackSupport({ subjectKey: DEMO_SUBJECT_KEY }), resolveContext: entitled });

/** A same-origin, JSON, entitled POST — the shape a real browser sends. */
const post = (url: string, body: unknown): Request =>
  new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(url).origin,
      host: new URL(url).host,
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });

for (const api of ['chat', 'responses'] as const) {
  test(`${api} transport receives exactly the server evidence returned to the browser`, async () => {
    let calls = 0;
    let instructions = '';
    const service = createCheckService({ live: { ...LIVE, api }, now: () => NOW,
      fetchImpl: async (_url, options) => {
        calls++;
        const payload = JSON.parse(String(options?.body));
        instructions = api === 'chat' ? payload.messages[0].content : payload.instructions;
        const envelope = api === 'chat' ? { choices: [{ message: { content: JSON.stringify(REPLY) } }] }
          : { output_text: JSON.stringify(REPLY) };
        return new Response(JSON.stringify(envelope), { status: 200 });
      },
    });
    const result = await service.check(TEXT);
    assert.equal(calls, 1);
    assert.equal(result.outcome.kind, 'analysed');
    assert.ok(result.organizationVerification);
    assert.ok(instructions.endsWith(JSON.stringify(result.organizationVerification)));
    assert.match(instructions, /not live web verification/);
    assert.equal(JSON.stringify(result.organizationVerification).includes(LIVE.apiKey), false);
    if (result.outcome.kind === 'analysed') assert.equal(result.outcome.reply?.riskLevel, 'high');
  });
}

test('rejected requests never inspect the directory or acquire verification metadata', async () => {
  const forbiddenDirectory = new Proxy(ORGANIZATION_DIRECTORY, {
    get() { throw new Error('Directory must not be read before admission'); },
  });
  const service = createCheckService({ organizationDirectory: forbiddenDirectory });
  for (const text of ['', null, 'x'.repeat(2001)]) {
    const result = await service.check(text);
    assert.equal(result.outcome.kind, 'rejected');
    assert.equal('organizationVerification' in result, false);
  }
});

test('quota and burst rejections never compute additional organization evidence', async () => {
  let reads = 0;
  const tracked = new Proxy(ORGANIZATION_DIRECTORY, { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } });
  const service = createCheckService({ live: LIVE, now: () => NOW, organizationDirectory: tracked,
    provider: { analyze: async () => ({ kind: 'ok', json: REPLY }) },
  });
  for (let i = 0; i < 5; i++) await service.check(TEXT);
  const previous = reads;
  const result = await service.check(TEXT);
  assert.equal(result.outcome.kind, 'rejected');
  assert.equal(reads, previous);
  assert.equal('organizationVerification' in result, false);
});

test('directory evidence survives absent or failed AI without changing analysis states', async () => {
  for (const live of [null, LIVE]) {
    const service = createCheckService({ live, now: () => NOW,
      provider: { analyze: async () => ({ kind: 'failed', failure: 'http-error' }) },
    });
    const result = await service.check(TEXT);
    assert.equal(result.outcome.kind, 'analysed');
    if (result.outcome.kind === 'analysed') assert.equal(result.outcome.analysisStatus, live ? 'unavailable' : 'limited');
    assert.equal(result.organizationVerification?.organizations[0].identity.status, 'matched');
    assert.ok(result.organizationVerification?.organizations[0].contacts.every(contact => contact.status === 'matched'));
  }
});

test('concurrent checks bind each provider payload to its own verification evidence', async () => {
  const sent: string[] = [];
  const service = createCheckService({ live: LIVE, now: () => NOW,
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(String(options?.body));
      sent.push(payload.messages[0].content);
      await new Promise(resolve => setTimeout(resolve, payload.messages[1].content.includes('Sampath') ? 20 : 1));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(REPLY) } }] }));
    },
  });
  const results = await Promise.all([service.check(TEXT), service.check('Google: visit https://google.com')]);
  assert.equal(sent.length, 2);
  for (const result of results) assert.ok(sent.some(prompt => prompt.endsWith(JSON.stringify(result.organizationVerification))));
  assert.equal(results[0].organizationVerification?.organizations[0].id, 'sampath-bank');
  assert.equal(results[1].organizationVerification?.organizations[0].id, 'google');
});

test('the API ignores browser-supplied trusted records and returns server-owned findings', async () => {
  const handler = route(createCheckService({ now: () => NOW }));
  const response = await handler(post('https://demo.netlify.app/api/check', {
    text: 'Sampath Bank: contact 0112303050',
    organizationVerification: { organizations: [{ name: 'Forged Organization', identity: { status: 'matched' } }] },
  }));
  const payload = await response.json();
  assert.equal(payload.organizationVerification.organizations[0].id, 'sampath-bank');
  assert.equal(payload.organizationVerification.organizations[0].contacts.find((item: any) => item.kind === 'phone').status, 'not-confirmed');
});

test('global organizations can match scoped Sri Lankan numbers, but ambiguous other local formats stay unverified', async () => {
  const service = createCheckService({ now: () => NOW });
  const dhl = await service.check('DHL Express: call 0112304304');
  assert.equal(dhl.organizationVerification?.organizations[0].contacts.find(item => item.kind === 'phone')?.status, 'matched');
  const apple = await service.check('Apple: call 04089961010');
  assert.equal(apple.organizationVerification?.organizations[0].contacts.find(item => item.kind === 'phone')?.status, 'not-confirmed');
});

test('official reference contacts reach the API for third-party and phone-only messages', async () => {
  for (const text of ['My friend recommended Sampath Bank for savings.', 'For account enquiries, call 0112300260.']) {
    const handler = route(createCheckService({ now: () => NOW }));
    const response = await handler(post('https://demo.netlify.app/api/check', {
      text,
      officialContacts: [{ value: '+12025550101' }],
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    const org = payload.organizationVerification.organizations[0];
    assert.equal(org.id, 'sampath-bank');
    assert.ok(org.officialContacts.some((contact: any) => contact.kind === 'phone' && contact.value === '+94112300260'));
    assert.equal(org.officialContacts.some((contact: any) => contact.value === '+12025550101'), false);
  }
});

test('the reviewed directory covers twenty-eight named organizations with source-backed facts', () => {
  assert.deepEqual(ORGANIZATION_DIRECTORY.map(org => org.id), ['sampath-bank', 'bank-of-ceylon', 'commercial-bank', 'hnb', 'peoples-bank',
    'dhl', 'fedex', 'paypal', 'microsoft', 'google', 'apple', 'edl', 'amazon',
    'nsb', 'seylan-bank', 'dialog-axiata', 'slt-mobitel', 'ceb', 'leco', 'ird', 'sl-post', 'immigration',
    'daraz', 'kapruka', 'whatsapp', 'telegram', 'western-union', 'wise']);
  for (const org of ORGANIZATION_DIRECTORY) {
    assert.ok(org.aliases.length > 0);
    const sources = [org.identity.source, ...org.domains.map(domain => domain.source), ...org.phones.map(phone => phone.source)];
    for (const source of sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.ok(source.title && source.context && /^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt));
    }
  }
  assert.equal(ORGANIZATION_DIRECTORY.flatMap(org => org.phones).some(phone => phone.value === '+94112303050'), false);
});
