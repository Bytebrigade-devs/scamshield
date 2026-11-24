import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import { createCheckRoute } from './check-route.ts';
import { createCheckService, DEMO_SUBJECT_KEY } from './check-service.ts';
import { createFeedbackSupport } from './feedback-endpoint.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';
import { GUIDANCE_DIRECTORY } from './guidance-directory.ts';
import { possibleLookalikeEvidence } from './link-inspection.ts';

/** A verified, entitled caller: these tests exercise the pipeline, not admission. */
const ENTITLED_TEST_DECISION = {
  kind: 'verified',
  user: { id: 'test-user' },
  entitlement: {
    canRunCheck: true, reason: 'valid_entitlement',
    planId: 'sentinel', status: 'trialing', expiresAt: '2099-01-01T00:00:00.000Z',
  },
} as const;

const NOW = Date.UTC(2026, 9, 31, 12);
const TEXT = 'Google: please check https://g00gle.com/private?token=synthetic';
const LIVE = { apiKey: 'synthetic-guidance-secret', baseUrl: 'https://provider.invalid/v1', model: 'fixture' };
const REPLY = { verdict: 'undetermined', category: 'unknown_other', taxonomy_version: '0.1.0-draft',
  reason: 'The overall context needs independent verification.', risk_level: 'undetermined' };

for (const api of ['chat', 'responses'] as const) {
  test(`${api} receives compact lookalike evidence, original text and no guidance metadata`, async () => {
    let calls = 0;
    let prompt = '';
    const service = createCheckService({ live: { ...LIVE, api }, now: () => NOW,
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(url, `https://provider.invalid/v1/${api === 'chat' ? 'chat/completions' : 'responses'}`);
        const body = JSON.parse(String(options?.body));
        prompt = api === 'chat' ? body.messages[0].content : body.instructions;
        assert.equal(api === 'chat' ? body.messages[1].content : body.input, TEXT);
        return Response.json(api === 'chat' ? { choices: [{ message: { content: JSON.stringify(REPLY) } }] } : { output_text: JSON.stringify(REPLY) });
      } });
    const result = await service.check(TEXT, 'Google support');
    assert.equal(calls, 1);
    assert.ok(result.linkInspection && result.guidanceResources);
    assert.ok(prompt.includes(JSON.stringify(possibleLookalikeEvidence(result.linkInspection))));
    assert.equal(prompt.includes('contact-payment-provider'), false);
    assert.equal(prompt.includes('lk-cert-report'), false);
    assert.equal(prompt.includes('guidanceResources'), false);
    assert.equal(prompt.includes(result.guidanceResources.fallback), false);
    assert.equal(JSON.stringify(result).includes(LIVE.apiKey), false);
    assert.equal(result.outcome.kind === 'analysed' && result.outcome.reply?.riskLevel, 'undetermined');
  });
}

test('rules-only and failed/invalid AI outcomes preserve link and guidance metadata without changing risk or statuses', async () => {
  for (const failure of ['unconfigured', 'http-error', 'bad-json'] as const) {
    const service = createCheckService({ now: () => NOW, live: failure === 'unconfigured' ? null : LIVE,
      provider: { analyze: async () => failure === 'bad-json' ? { kind: 'ok', json: { invented: true } } : { kind: 'failed', failure: 'http-error' } } });
    const result = await service.check(TEXT);
    assert.equal(result.linkInspection?.findings[0].status, 'possible-lookalike');
    assert.ok(result.guidanceResources?.resources.some(resource => resource.organizationId === 'google'));
    assert.equal(result.outcome.kind, 'analysed');
    if (result.outcome.kind !== 'analysed') return;
    assert.equal(result.outcome.analysisStatus, failure === 'unconfigured' ? 'limited' : 'unavailable');
    assert.equal(result.outcome.reply, null);
    assert.equal('riskLevel' in result.linkInspection!, false);
  }
});

test('a model-assessed low result is never overwritten by local lookalike findings', async () => {
  const service = createCheckService({ now: () => NOW, live: LIVE,
    provider: { analyze: async () => ({ kind: 'ok', json: { ...REPLY, verdict: 'no obvious indicators', risk_level: 'low' } }) } });
  const result = await service.check(TEXT);
  assert.equal(result.linkInspection?.findings[0].status, 'possible-lookalike');
  assert.equal(result.outcome.kind === 'analysed' && result.outcome.reply?.riskLevel, 'low');
});

test('invalid text and sender read neither catalog and expose no new metadata before admission', async () => {
  const deniedOrganizations = new Proxy(ORGANIZATION_DIRECTORY, { get() { throw new Error('No directory access before admission'); } });
  const deniedGuidance = new Proxy(GUIDANCE_DIRECTORY, { get() { throw new Error('No guidance access before admission'); } });
  const service = createCheckService({ now: () => NOW, organizationDirectory: deniedOrganizations, guidanceDirectory: deniedGuidance });
  for (const [text, sender] of [['', undefined], [null, undefined], ['x'.repeat(2001), undefined], [TEXT, {}], [TEXT, 'x'.repeat(255)]]) {
    const result = await service.check(text, sender);
    assert.equal(result.outcome.kind, 'rejected');
    assert.equal('linkInspection' in result, false);
    assert.equal('guidanceResources' in result, false);
  }
});

test('burst, quota and expired access do not read catalogs or produce link/guidance metadata', async () => {
  for (const gate of ['burst', 'quota', 'expired']) {
    let clock = NOW;
    let blocked = false;
    const organizations = new Proxy(ORGANIZATION_DIRECTORY, { get(target, key, receiver) {
      if (blocked) throw new Error('Organization catalog read after denied admission');
      return Reflect.get(target, key, receiver);
    } });
    const guidance = new Proxy(GUIDANCE_DIRECTORY, { get(target, key, receiver) {
      if (blocked) throw new Error('Guidance catalog read after denied admission');
      return Reflect.get(target, key, receiver);
    } });
    const service = createCheckService({ now: () => clock, live: LIVE, organizationDirectory: organizations,
      guidanceDirectory: guidance, provider: { analyze: async () => ({ kind: 'ok', json: REPLY }) } });
    if (gate === 'expired') clock += 8 * 86_400_000;
    else for (let index = 0; index < (gate === 'burst' ? 5 : 15); index++) {
      assert.equal((await service.check(TEXT)).outcome.kind, 'analysed');
      if (gate === 'quota') clock += 61_000;
    }
    blocked = true;
    const result = await service.check(TEXT);
    assert.equal(result.outcome.kind, 'rejected', gate);
    assert.equal('linkInspection' in result, false, gate);
    assert.equal('guidanceResources' in result, false, gate);
  }
});

test('concurrent provider calls use request-local link evidence and guidance', async () => {
  let bothReceived!: () => void;
  let release!: () => void;
  const received = new Promise<void>(resolve => { bothReceived = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const payloads: any[] = [];
  const service = createCheckService({ now: () => NOW, live: LIVE, fetchImpl: async (_url, options) => {
    payloads.push(JSON.parse(String(options?.body)));
    if (payloads.length === 2) bothReceived();
    await wait;
    return Response.json({ choices: [{ message: { content: JSON.stringify(REPLY) } }] });
  } });
  const checks = [service.check(TEXT), service.check('Microsoft: https://rnicrosoft.com')];
  await received;
  release();
  const results = await Promise.all(checks);
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const prompt = payloads.find(payload => payload.messages[1].content === (index === 0 ? TEXT : 'Microsoft: https://rnicrosoft.com')).messages[0].content;
    assert.ok(prompt.includes(JSON.stringify(possibleLookalikeEvidence(result.linkInspection))));
    const expectedId = index === 0 ? 'google' : 'microsoft';
    assert.ok(result.guidanceResources?.resources.some(resource => resource.organizationId === expectedId));
    assert.equal(result.guidanceResources?.resources.some(resource => resource.organizationId === (index === 0 ? 'microsoft' : 'google')), false);
  }
});

test('unconfigured service performs no submitted-link HTTP or DNS requests', async () => {
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('Submitted network call forbidden'); });
  const lookup = mock.method(dns, 'lookup', () => { throw new Error('Submitted DNS forbidden'); });
  try {
    const service = createCheckService({ now: () => NOW });
    const result = await service.check('Google: https://g00gle.com https://127.0.0.1/private https://metadata.google.internal/credentials');
    assert.equal(result.outcome.kind, 'analysed');
    assert.ok(result.linkInspection && result.guidanceResources);
    assert.equal(network.mock.callCount(), 0);
    assert.equal(lookup.mock.callCount(), 0);
  } finally { network.mock.restore(); lookup.mock.restore(); }
});

test('POST preserves {text,sender?} and ignores forged findings, guidance, exposure and authority', async () => {
  const service = createCheckService({ now: () => NOW });
  const handler = createCheckRoute({
    service,
    feedback: createFeedbackSupport({ subjectKey: DEMO_SUBJECT_KEY }),
    resolveContext: async () => ENTITLED_TEST_DECISION,
  });
  const base = 'https://demo.netlify.app';
  const response = await handler(new Request(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base, host: 'demo.netlify.app', authorization: 'Bearer test-token' },
    body: JSON.stringify({ text: TEXT, sender: 'Unverified displayed name', exposure: 'paid',
      linkInspection: { findings: [{ status: 'official-match', hostname: 'g00gle.com' }] },
      guidanceResources: { resources: [{ url: 'https://attacker.invalid/forged', phone: '+12025550123' }] },
      organizationDirectory: [{ id: 'forged' }], riskLevel: 'low', admission: true }) }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.linkInspection.findings[0].status, 'possible-lookalike');
  assert.ok(result.guidanceResources.actions.some((action: any) => action.exposures.includes('received')));
  assert.ok(result.guidanceResources.actions.some((action: any) => action.exposures.includes('paid')));
  assert.equal(JSON.stringify(result).includes('attacker.invalid/forged'), false);
  assert.equal(JSON.stringify(result).includes('+12025550123'), false);
  assert.equal('exposure' in result, false);
  assert.equal(result.senderVerification.value, 'Unverified displayed name');
  assert.equal(result.organizationVerification.organizations[0].kind, 'technology');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('injected stale guidance/organization facts survive provider failure with explicit outdated markers', async () => {
  const old = '2026-01-01';
  const organizations = ORGANIZATION_DIRECTORY.map(org => ({ ...org, domains: org.domains.map(domain => ({ ...domain, source: { ...domain.source, reviewedAt: old } })) }));
  const guidance = GUIDANCE_DIRECTORY.map(record => ({ ...record, source: { ...record.source, reviewedAt: old } }));
  const service = createCheckService({ now: () => NOW, live: LIVE, organizationDirectory: organizations, guidanceDirectory: guidance,
    provider: { analyze: async () => ({ kind: 'failed', failure: 'network' }) } });
  const result = await service.check(TEXT);
  assert.ok(result.linkInspection?.findings[0].matches.every(match => match.outdated));
  assert.ok(result.guidanceResources?.resources.every(resource => resource.status === 'outdated' && !resource.url && !resource.phone));
  assert.match(result.guidanceResources!.fallback, /independently obtained/);
  assert.equal(result.outcome.kind === 'analysed' && result.outcome.analysisStatus, 'unavailable');
});
