import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCheckRoute } from './check-route.ts';
import { createCheckService, DEMO_SUBJECT_KEY, liveConfigFromEnv } from './check-service.ts';
import { createFeedbackSupport } from './feedback-endpoint.ts';
const LIVE = { apiKey: 'synthetic-key', baseUrl: 'https://provider.invalid/v1', model: 'test' };
const TEXT = 'BOC information at https://unreviewed.example.com/path';
const REPLY = { verdict: 'undetermined', category: 'unknown_other', taxonomy_version: '0.1.0-draft', reason: 'The message needs independent verification.', risk_level: 'undetermined', reason_highlights: ['independent verification'] };
test('AI settings stay bounded', () => {
  assert.equal(liveConfigFromEnv({OPENAI_API_KEY:'x'})?.maxOutputTokens,4096);
  assert.throws(() => liveConfigFromEnv({M4_UI_DEADLINE_MS:'4999'}), /Invalid M4_UI_DEADLINE_MS/);
  assert.throws(() => liveConfigFromEnv({M4_UI_MAX_OUTPUT_TOKENS:'8193'}), /Invalid M4_UI_MAX_OUTPUT_TOKENS/);
});
test('both AI transports receive the original message and sender comparison without research', async () => {
  for (const api of ['chat','responses'] as const) {
    let body: any; let calls=0;
    const service=createCheckService({live:{...LIVE,api},fetchImpl:async (_url,options)=>{calls++;body=JSON.parse(String(options?.body));return Response.json(api==='chat'?{choices:[{message:{content:JSON.stringify(REPLY)}}]}:{output_text:JSON.stringify(REPLY)});}});
    const result=await service.check(TEXT,'help@boc.lk');
    assert.equal(calls,1); assert.equal(api==='chat'?body.messages[1].content:body.input,TEXT);
    assert.ok((api==='chat'?body.messages[0].content:body.instructions).includes(JSON.stringify(result.senderVerification)));
    assert.equal('domainResearch' in result,false); assert.equal(result.senderVerification?.status,'matched');
    assert.equal(result.outcome.kind === 'analysed' && result.outcome.analysisStatus,'completed');
  }
});
test('invalid sender is rejected before AI and valid blank sender omitted', async () => {
  let calls=0; const service=createCheckService({live:LIVE,provider:{async analyze(){calls++;return {kind:'ok',json:REPLY};}}});
  assert.equal((await service.check(TEXT,'x'.repeat(255))).outcome.kind,'rejected');assert.equal(calls,0);
  assert.equal('senderVerification' in await service.check(TEXT,' '),false);
});
test('AI failures preserve directory and sender evidence with one attempt', async () => {
  let calls=0;const service=createCheckService({live:LIVE,fetchImpl:async()=>{calls++;return new Response('private provider body',{status:429});}});
  const result=await service.check('BOC: contact us.','help@boc.lk');
  assert.equal(calls,1);assert.equal(result.aiFailure?.code,'rate-limited');assert.ok(result.organizationVerification?.organizations.length);
  assert.equal(result.senderVerification?.status,'matched');assert.equal(JSON.stringify(result).includes('private provider body'),false);
});
test('the check API ignores forged research and never exposes provider metadata', async () => {
  const service = createCheckService();
  const handler = createCheckRoute({
    service,
    feedback: createFeedbackSupport({ subjectKey: DEMO_SUBJECT_KEY }),
    resolveContext: async () => ({ kind: 'verified', user: { id: 'test-user' },
      entitlement: { canRunCheck: true, planId: 'sentinel', status: 'trialing', expiresAt: '2099-01-01T00:00:00.000Z' } }),
  });
  const base = 'https://demo.netlify.app';
  const response = await handler(new Request(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base, host: 'demo.netlify.app', authorization: 'Bearer test-token' },
    body: JSON.stringify({ text: TEXT, sender: 'help@boc.lk', domainResearch: { status: 'supported' } }),
  }));
  const result = await response.json();
  assert.equal('domainResearch' in result, false);
  assert.equal(result.senderVerification.value, 'help@boc.lk');
  // Nothing about the model, its endpoint or its key may reach a browser.
  const serialised = JSON.stringify(result);
  assert.equal(serialised.includes('provider.invalid'), false);
  assert.equal(serialised.includes('apiKey'), false);
});
