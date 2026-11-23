/**
 * Check-service tests: the real boundary must produce all three honest X-13 pairs through
 * automatic server-side provider selection, with all provider I/O injected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCheckService, liveConfigFromEnv, normalizeEndpoint, normalizeResponsesEndpoint } from './check-service.ts';
import type { ProviderPort } from '../boundary/check-boundary.ts';
import { RULES_ONLY_LIMITATION, UNAVAILABLE_LIMITATION, EMPTY_INPUT_MESSAGE } from '../boundary/check-boundary.ts';
import { readFileSync } from 'node:fs';
import { sanitizeText } from './public/render-safe.js';
import { createSummaryModel, summaryText } from './public/summary.js';

const FIXTURE = 'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';
const LIVE = { apiKey: 'synthetic-service-key', baseUrl: 'https://provider.invalid/v1', model: 'test-model' };
const REPLY = { verdict: 'Potentially suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft', reason: 'Pressure and a request for credentials.' };
const completedProvider: ProviderPort = { analyze: async () => ({ kind: 'ok', json: REPLY }) };

test('automatic default without credentials never produces a simulated completion', async () => {
  const service = createCheckService();
  const { outcome, providerMode } = await service.check(FIXTURE);
  assert.equal(providerMode, 'live-unconfigured');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') assert.equal(outcome.analysisStatus, 'limited');
  assert.equal('reset' in service, false);
});

test('configured AI is selected automatically and carries validated reply and rules evidence', async () => {
  const service = createCheckService({ live: LIVE, provider: completedProvider });
  const { outcome, providerMode } = await service.check(FIXTURE);
  assert.equal(providerMode, 'live');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'completed');
  assert.equal(outcome.analysisMode, 'rules_and_ai');
  assert.equal(outcome.category, 'phishing');
  assert.ok(outcome.reply);
  assert.equal(outcome.reply!.verdictLabel, REPLY.verdict.toLowerCase(), 'transport labels are normalized at the boundary');
  assert.ok(outcome.rules.matches.length > 0, 'real rule engine should flag the fixture');
  assert.deepEqual(outcome.limitations, []);
});

test('rules-only outcome: limited/rules_only with unknown_other and no reply', async () => {
  const service = createCheckService();
  const { outcome, providerMode } = await service.check(FIXTURE);
  assert.equal(providerMode, 'live-unconfigured');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'limited');
  assert.equal(outcome.analysisMode, 'rules_only');
  assert.equal(outcome.category, 'unknown_other');
  assert.equal(outcome.reply, null);
  assert.deepEqual(outcome.limitations, [RULES_ONLY_LIMITATION]);
});

test('configured provider failure with no fallback configured is unavailable, never a fabricated completion', async () => {
  const service = createCheckService({ live: LIVE, provider: { analyze: async () => ({ kind: 'failed', failure: 'http-error' }) } });
  const { outcome } = await service.check(FIXTURE);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'unavailable');
  assert.equal(outcome.analysisMode, 'none');
  assert.equal(outcome.category, 'unknown_other');
  assert.equal(outcome.reply, null);
  assert.deepEqual(outcome.limitations, [UNAVAILABLE_LIMITATION]);
});

test('without server credentials automatically degrades to labelled rules-only', async () => {
  const service = createCheckService({ live: null });
  assert.equal(service.liveConfigured, false);
  const { outcome, providerMode } = await service.check(FIXTURE);
  assert.equal(providerMode, 'live-unconfigured');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'limited');
  assert.equal(outcome.analysisMode, 'rules_only');
});

test('empty and whitespace-only input are rejected before any analysis', async () => {
  const service = createCheckService();
  for (const text of ['', '   \n\t ']) {
    const { outcome } = await service.check(text);
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'invalid-input');
    assert.equal(outcome.message, EMPTY_INPUT_MESSAGE);
  }
});

test('over-cap input is rejected, never truncated', async () => {
  const service = createCheckService();
  const { outcome } = await service.check('x'.repeat(2001));
  assert.equal(outcome.kind, 'rejected');
  if (outcome.kind !== 'rejected') return;
  assert.equal(outcome.reason, 'invalid-input');
  assert.match(outcome.message, /2,000/);
});

test('non-string text cannot authorize analysis', async () => {
  const service = createCheckService();
  for (const value of [null, 42, { text: 'hello' }, ['hello']]) {
    const { outcome } = await service.check(value);
    assert.equal(outcome.kind, 'rejected');
  }
});

test('burst guard rejects the sixth check and exposes no reset operation', async () => {
  const fixed = 1_800_000_000_000;
  const service = createCheckService({ now: () => fixed });
  for (let i = 0; i < 5; i += 1) {
    const { outcome } = await service.check(FIXTURE);
    assert.equal(outcome.kind, 'analysed', `check ${i + 1} should be admitted`);
  }
  const denied = await service.check(FIXTURE);
  assert.equal(denied.outcome.kind, 'rejected');
  if (denied.outcome.kind !== 'rejected') return;
  assert.equal(denied.outcome.reason, 'rate-denied');

  assert.equal('reset' in service, false);
});

test('trial monthly quota blocks the sixteenth completed check across windows', async () => {
  let clock = 1_800_000_000_000;
  const service = createCheckService({ live: LIVE, provider: completedProvider, now: () => clock });
  for (let i = 0; i < 15; i += 1) {
    const { outcome } = await service.check(FIXTURE);
    assert.equal(outcome.kind, 'analysed', `check ${i + 1} should be admitted`);
    clock += 61_000; // clear the one-minute burst window
  }
  const denied = await service.check(FIXTURE);
  assert.equal(denied.outcome.kind, 'rejected');
  if (denied.outcome.kind !== 'rejected') return;
  assert.equal(denied.outcome.reason, 'quota-denied');
});

test('failed checks release quota for a later completion', async () => {
  let clock = 1_800_000_000_000;
  let calls = 0;
  const service = createCheckService({ live: LIVE, now: () => clock, provider: { analyze: async () => ++calls <= 20
    ? { kind: 'failed', failure: 'http-error' }
    : { kind: 'ok', json: REPLY } } });
  for (let i = 0; i < 20; i += 1) {
    const { outcome } = await service.check(FIXTURE);
    assert.equal(outcome.kind, 'analysed');
    clock += 61_000;
  }
  const completed = await service.check(FIXTURE);
  assert.equal(completed.outcome.kind, 'analysed');
  if (completed.outcome.kind !== 'analysed') return;
  assert.equal(completed.outcome.analysisStatus, 'completed');
});

test('normalizeEndpoint accepts base and full chat-completions URLs', () => {
  assert.equal(normalizeEndpoint('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
  assert.equal(normalizeEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
  assert.equal(
    normalizeEndpoint('https://api.example.com/v1/chat/completions'),
    'https://api.example.com/v1/chat/completions',
  );
});

test('normalizeResponsesEndpoint accepts base and full responses URLs', () => {
  assert.equal(normalizeResponsesEndpoint('https://agentrouter.org/v1'), 'https://agentrouter.org/v1/responses');
  assert.equal(normalizeResponsesEndpoint('https://agentrouter.org/v1/'), 'https://agentrouter.org/v1/responses');
  assert.equal(
    normalizeResponsesEndpoint('https://agentrouter.org/v1/responses'),
    'https://agentrouter.org/v1/responses',
  );
});

for (const api of ['chat', 'responses'] as const) {
  test(`automatic ${api} adapter selection uses an injected transport without network`, async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json(api === 'responses'
        ? { output_text: JSON.stringify(REPLY) }
        : { choices: [{ message: { content: JSON.stringify(REPLY) } }] });
    }) as typeof fetch;
    const service = createCheckService({ live: { ...LIVE, api }, fetchImpl });
    const { outcome } = await service.check(FIXTURE);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${LIVE.baseUrl}/${api === 'responses' ? 'responses' : 'chat/completions'}`);
    assert.equal(new Headers(calls[0].init.headers).get('authorization'), `Bearer ${LIVE.apiKey}`);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(api === 'responses' ? body.input : body.messages.at(-1).content, FIXTURE);
    const instructions = api === 'responses' ? body.instructions : body.messages[0].content;
    for (const phrase of ['risk_level', 'reason_highlights', '35%', 'domain suffix alone', 'untrusted evidence', 'no internet access']) {
      assert.ok(instructions.includes(phrase), `${api} instructions include ${phrase}`);
    }
    assert.equal(outcome.kind, 'analysed');
    if (outcome.kind === 'analysed') assert.equal(outcome.analysisStatus, 'completed');
  });
}

test('missing and blank credentials never invoke test injection or transport', async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls += 1; throw new Error('unexpected fetch'); }) as typeof fetch;
  for (const live of [null, { ...LIVE, apiKey: '' }, { ...LIVE, apiKey: '   ' }]) {
    const service = createCheckService({ live, fetchImpl, provider: { analyze: async () => {
      calls += 1;
      return { kind: 'ok', json: REPLY };
    } } });
    assert.equal(service.liveConfigured, false);
    const { outcome } = await service.check(FIXTURE);
    assert.equal(outcome.kind, 'analysed');
    if (outcome.kind === 'analysed') assert.equal(outcome.analysisStatus, 'limited');
  }
  assert.equal(calls, 0);
});

test('fine-message regression: high AI risk and exact highlights survive one local pattern', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../../testing/M4-result-regression.json', import.meta.url), 'utf8'));
  const service = createCheckService({ live: LIVE, provider: { analyze: async () => ({ kind: 'ok', json: fixture.reply }) } });
  const { outcome } = await service.check(fixture.text);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'completed');
  assert.equal(new Set(outcome.rules.matches.map((match) => match.ruleId)).size, 1);
  assert.equal(outcome.reply?.riskLevel, 'high');
  assert.equal(outcome.reply?.reason, fixture.reply.reason);
  assert.deepEqual(outcome.reply?.reasonHighlights.map((span) => span.excerpt), [...fixture.reply.reason_highlights].sort((a, b) => fixture.reply.reason.indexOf(a) - fixture.reply.reason.indexOf(b)));
});

test('high AI risk needs no local matches and invalid optional metadata preserves completion', async () => {
  for (const risk_level of ['high', 'invalid']) {
    const service = createCheckService({ live: LIVE, provider: { analyze: async () => ({ kind: 'ok', json: { ...REPLY, risk_level, reason_highlights: 'invalid' } }) } });
    const { outcome } = await service.check('Your wallet must be synchronized with our recovery wallet to protect your savings.');
    assert.equal(outcome.kind, 'analysed');
    if (outcome.kind !== 'analysed') return;
    assert.equal(outcome.analysisStatus, 'completed');
    assert.equal(outcome.rules.matches.length, 0);
    assert.equal(outcome.reply?.riskLevel, risk_level === 'high' ? 'high' : 'undetermined');
    assert.deepEqual(outcome.reply?.reasonHighlights, []);
  }
});

test('configured HTTP failure makes one attempt and never leaks response details', async () => {
  let calls = 0;
  const service = createCheckService({ live: LIVE, fetchImpl: (async () => {
    calls += 1;
    return new Response(`sensitive failure ${LIVE.apiKey}`, { status: 401 });
  }) as typeof fetch });
  const result = await service.check(FIXTURE);
  assert.equal(calls, 1);
  assert.equal(result.outcome.kind, 'analysed');
  if (result.outcome.kind === 'analysed') assert.equal(result.outcome.analysisStatus, 'unavailable');
  assert.equal(JSON.stringify(result).includes(LIVE.apiKey), false);
});

test('invalid inputs never invoke the provider; exactly 2,000 characters remain verbatim', async () => {
  const submitted: string[] = [];
  const service = createCheckService({ live: LIVE, provider: { analyze: async (text) => {
    submitted.push(text);
    return { kind: 'ok', json: REPLY };
  } } });
  for (const text of ['', ' \n\t', null, 42, 'x'.repeat(2001)]) {
    assert.equal((await service.check(text)).outcome.kind, 'rejected');
  }
  assert.equal(submitted.length, 0);
  const text = 'x'.repeat(2000);
  assert.equal((await service.check(text)).outcome.kind, 'analysed');
  assert.deepEqual(submitted, [text]);
});

// ---- M4-15 edge cases and graceful fallback (10 November 2026 additions) ----

test('M4-15/FS-M4-06: a configured provider timeout with no fallback configured is unavailable at the UI layer — one attempt', async () => {
  let calls = 0;
  const service = createCheckService({ live: LIVE, provider: { analyze: async () => {
    calls += 1;
    return { kind: 'failed', failure: 'timeout' };
  } } });
  const { outcome, providerMode, aiFailure } = await service.check(FIXTURE);
  assert.equal(calls, 1, 'exactly one provider attempt — no retry, no fallback model');
  assert.equal(providerMode, 'live');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'unavailable');
  assert.equal(outcome.analysisMode, 'none');
  assert.equal(outcome.category, 'unknown_other', 'never a "safe" or legitimate outcome');
  assert.equal(outcome.reply, null, 'no AI assessment is invented');
  assert.deepEqual(outcome.limitations, [UNAVAILABLE_LIMITATION]);
  assert.ok(outcome.rules.matches.length > 0, 'local rule evidence still accompanies the unavailable state');
  assert.deepEqual(aiFailure, { code: 'timeout' }, 'the sanitized diagnostic names the timeout');
});

test('M4-15: a rules-only result with the current (non-legacy) payload feeds the summary honestly', async () => {
  const service = createCheckService(); // no credentials → explicitly labelled rules-only
  const result = await service.check(FIXTURE);
  assert.equal(result.providerMode, 'live-unconfigured');
  assert.equal(result.outcome.kind, 'analysed');
  if (result.outcome.kind !== 'analysed') return;
  assert.equal(result.outcome.analysisStatus, 'limited');
  assert.equal(result.outcome.analysisMode, 'rules_only');
  // The fresh payload carries the current server-owned evidence fields; the legacy shape did not.
  assert.ok(result.organizationVerification);
  assert.ok(result.linkInspection);
  assert.ok(result.guidanceResources);
  const summary = summaryText(createSummaryModel(result, FIXTURE, '2026-11-10T10:30:00.000Z'));
  assert.match(summary, /Analysis: Limited — local patterns only/);
  assert.match(summary, /Link evidence \(submitted addresses omitted\)/);
  assert.doesNotMatch(summary, /Link-inspection metadata was not available in this response\./,
    'fresh link metadata is consumed rather than treated as the legacy minimal payload');
  assert.equal(summary.includes(FIXTURE), false, 'the original message still never enters the summary');
});

test('M4-15: control and bidi characters keep submitted-text offsets aligned for local evidence', async () => {
  const text = `${FIXTURE}\u202E\u2066\u0000`;
  const service = createCheckService();
  const { outcome } = await service.check(text);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'limited');
  assert.ok(outcome.rules.matches.length > 0);
  for (const match of outcome.rules.matches) {
    assert.equal(text.slice(match.start, match.end), match.excerpt, 'evidence spans index the original text');
  }
  assert.equal(sanitizeText(text).length, text.length,
    'length-preserving display neutralisation keeps those offsets valid after sanitisation');
});

test('M4-15/FS-M4-04: Tamil text is analysed as text only — no language or safety claim', async () => {
  const service = createCheckService();
  const text = 'வணக்கம், உங்கள் கணக்கு முடக்கப்படும். https://example.lk/help';
  const { outcome } = await service.check(text);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind !== 'analysed') return;
  assert.equal(outcome.analysisStatus, 'limited');
  assert.equal(outcome.analysisMode, 'rules_only');
  assert.equal(outcome.category, 'unknown_other', 'no assessed category is invented for an unsupported language');
  assert.deepEqual(outcome.limitations, [RULES_ONLY_LIMITATION]);
  assert.deepEqual(outcome.candidates.urls, ['https://example.lk/help'], 'extraction is script-agnostic; no translation occurs');
});

// ---- X-13 0.2.0-draft local event emission (19 November 2026 additions) ----

test('an analysed outcome emits one local 0.2.0-draft event with the demo subject', async () => {
  const service = createCheckService();
  const { outcome } = await service.check(FIXTURE);
  assert.equal(outcome.kind, 'analysed');
  const events = await service.listEvents();
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.contract_version, '0.2.0-draft');
  assert.equal(event.event_type, 'm4.check_outcome');
  assert.equal((event as { subject_ref?: string }).subject_ref, 'local-ui-demo-subject');
  assert.equal(Object.keys(event).length, 9);
  assert.ok(event.occurred_at.endsWith('Z'), 'the terminal check time is UTC RFC-3339');
});

test('a completed AI outcome emits with its validated category; unavailable stays unknown_other', async () => {
  const completed = createCheckService({ live: LIVE, provider: completedProvider });
  assert.equal((await completed.check(FIXTURE)).outcome.kind, 'analysed');
  const [event] = await completed.listEvents();
  assert.equal(event.analysis_status, 'completed');
  assert.equal(event.category_id, 'phishing');

  const unavailable = createCheckService({ live: LIVE, provider: { analyze: async () => ({ kind: 'failed', failure: 'timeout' }) } });
  assert.equal((await unavailable.check(FIXTURE)).outcome.kind, 'analysed');
  const [failed] = await unavailable.listEvents();
  assert.equal(failed.analysis_status, 'unavailable');
  assert.equal(failed.category_id, 'unknown_other');
});

test('rejected outcomes emit no event; accepted checks get distinct ids', async () => {
  const service = createCheckService();
  assert.equal((await service.check('x'.repeat(2001))).outcome.kind, 'rejected');
  assert.equal((await service.listEvents()).length, 0);
  await service.check(FIXTURE);
  await service.check(FIXTURE);
  const events = await service.listEvents();
  assert.equal(events.length, 2);
  assert.notEqual(events[0].event_id, events[1].event_id);
});

test('an injected sink receives exactly one append per analysed check', async () => {
  const appended: unknown[] = [];
  const service = createCheckService({ events: { append: async (event) => { appended.push(event); return true; } } });
  const { outcome } = await service.check(FIXTURE);
  assert.equal(outcome.kind, 'analysed');
  assert.equal(appended.length, 1);
  assert.equal((appended[0] as { subject_ref?: string }).subject_ref, 'local-ui-demo-subject');
  assert.equal((await service.listEvents()).length, 0, 'an injected sink replaces the internal store');
});

test('events: null disables emission without affecting the check', async () => {
  const service = createCheckService({ events: null });
  const { outcome } = await service.check(FIXTURE);
  assert.equal(outcome.kind, 'analysed');
  assert.equal((await service.listEvents()).length, 0);
});

test('fallback model: configured via M4_UI_FALLBACK_MODEL and reported without the key', () => {
  const live = liveConfigFromEnv({
    OPENAI_API_KEY: 'synthetic-service-key',
    OPENAI_BASE_URL: 'https://provider.invalid/v1',
    M4_UI_MODEL: 'primary-model',
    M4_UI_FALLBACK_MODEL: 'fallback-model',
  } as NodeJS.ProcessEnv);

  assert.equal(live?.model, 'primary-model');
  assert.equal(live?.fallbackModel, 'fallback-model');

  const service = createCheckService({ live: live ?? undefined });
  assert.equal(service.model, 'primary-model');
  assert.equal(service.fallbackModel, 'fallback-model');
});

test('fallback model: absent or blank configuration means no fallback at all', () => {
  for (const value of [undefined, '', '   ']) {
    const live = liveConfigFromEnv({
      OPENAI_API_KEY: 'synthetic-service-key',
      M4_UI_MODEL: 'primary-model',
      M4_UI_FALLBACK_MODEL: value,
    } as NodeJS.ProcessEnv);
    assert.equal(live?.fallbackModel, null);
    const service = createCheckService({ live: live ?? undefined });
    assert.equal(service.fallbackModel, null, 'no fallback is enabled unless it is explicitly configured');
  }
});

test('fallback model: the same id as the primary is not a fallback', () => {
  const live = liveConfigFromEnv({
    OPENAI_API_KEY: 'synthetic-service-key',
    M4_UI_MODEL: 'same-model',
    M4_UI_FALLBACK_MODEL: 'same-model',
  } as NodeJS.ProcessEnv);

  const service = createCheckService({ live: live ?? undefined });
  assert.equal(service.fallbackModel, null, 'a second call to the same model is not a fallback');
});

test('fallback model: an injected provider is never wrapped, so call counts stay exact', async () => {
  let calls = 0;
  const injected: ProviderPort = {
    analyze: async () => {
      calls += 1;
      return { kind: 'failed', failure: 'timeout' };
    },
  };
  const service = createCheckService({
    live: { apiKey: 'synthetic-service-key', baseUrl: 'https://provider.invalid/v1', model: 'primary-model', fallbackModel: 'fallback-model' },
    provider: injected,
  });

  const { outcome } = await service.check(FIXTURE);

  assert.equal((outcome as { analysisStatus?: string }).analysisStatus, 'unavailable');
  assert.equal(calls, 1, 'the injected provider is authoritative; the fallback does not double the call');
});

// ---- Composite fallback wiring: the real adapter path through check-service ----

test('fallback composite: a primary transport failure completes on exactly one fallback fetch', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    if (calls.length === 1) return new Response(null, { status: 500 });
    return Response.json({ choices: [{ message: { content: JSON.stringify(REPLY) } }] });
  }) as typeof fetch;
  const service = createCheckService({ live: { ...LIVE, fallbackModel: 'fallback-model' }, fetchImpl });

  const { outcome, providerMode } = await service.check(FIXTURE);

  assert.equal(providerMode, 'live');
  assert.equal(calls.length, 2, 'exactly one primary attempt plus one fallback attempt');
  assert.equal(JSON.parse(calls[0].body).model, LIVE.model, 'the first call uses the primary model');
  assert.equal(JSON.parse(calls[1].body).model, 'fallback-model', 'the second call uses the fallback model');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') {
    assert.equal(outcome.analysisStatus, 'completed', 'the fallback answer completes the check');
    assert.equal(outcome.analysisMode, 'rules_and_ai');
    assert.ok(outcome.reply);
    assert.deepEqual(outcome.limitations, []);
  }
});

test('fallback composite: bad-json on the primary never triggers the fallback', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: 'not-json' } }] });
  }) as typeof fetch;
  const service = createCheckService({ live: { ...LIVE, fallbackModel: 'fallback-model' }, fetchImpl });

  const { outcome } = await service.check(FIXTURE);

  assert.equal(calls, 1, 'an unparseable or refused answer must not be re-asked of another model');
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') {
    assert.equal(outcome.analysisStatus, 'unavailable');
    assert.equal(outcome.analysisMode, 'none');
    assert.deepEqual(outcome.limitations, [UNAVAILABLE_LIMITATION]);
  }
});
