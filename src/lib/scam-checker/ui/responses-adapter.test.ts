/**
 * Responses-API adapter tests: AgentRouter transport, reply extraction, and enum-only failures.
 * All network access is injected — these tests never touch the network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsesPayload, createResponsesProvider, extractResponsesText } from './responses-adapter.ts';
import type { AiFailure } from '../boundary/openai-adapter.ts';

const ENDPOINT = 'https://agentrouter.invalid/v1/responses';
const VALID_REPLY = {
  verdict: 'Potentially suspicious',
  category: 'phishing',
  taxonomy_version: '0.1.0-draft',
  reason: 'Pressure plus credential request.',
};

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: () => Promise<Response> | Response, captured?: Captured[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (captured) captured.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function responsesEnvelope(text: string): unknown {
  return {
    id: 'resp_1',
    object: 'response',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
  };
}

test('missing key disables the live call with zero fetches', async () => {
  const captured: Captured[] = [];
  const provider = createResponsesProvider({
    apiKey: undefined,
    endpointUrl: ENDPOINT,
    model: 'gpt-6.1-sol',
    fetchImpl: fakeFetch(() => jsonResponse({}), captured),
  });
  const attempt = await provider.analyze('hello');
  assert.deepEqual(attempt, { kind: 'unconfigured' });
  assert.equal(captured.length, 0);
});

test('posts the Responses shape and returns the parsed reply', async () => {
  const captured: Captured[] = [];
  const provider = createResponsesProvider({
    apiKey: 'test-key',
    endpointUrl: ENDPOINT,
    model: 'gpt-6.1-sol',
    fetchImpl: fakeFetch(() => jsonResponse(responsesEnvelope(JSON.stringify(VALID_REPLY))), captured),
  });
  const attempt = await provider.analyze('Your account will be suspended. Verify your password.');
  assert.deepEqual(attempt, { kind: 'ok', json: VALID_REPLY });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, ENDPOINT);
  const headers = captured[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer test-key');
  const body = JSON.parse(String(captured[0].init.body)) as { model: string; input: string; instructions: string };
  assert.equal(body.model, 'gpt-6.1-sol');
  assert.match(body.input, /suspended/);
  assert.match(body.instructions, /taxonomy_version/);
});

test('requests carry a self-identifying user agent and a stable session header (OpenCode Go)', async () => {
  const captured: Captured[] = [];
  const provider = createResponsesProvider({
    apiKey: 'test-key',
    endpointUrl: ENDPOINT,
    model: 'gpt-5.6-luna',
    fetchImpl: fakeFetch(() => jsonResponse(responsesEnvelope(JSON.stringify(VALID_REPLY))), captured),
  });
  await provider.analyze('first synthetic message');
  await provider.analyze('second synthetic message');
  assert.equal(captured.length, 2);
  for (const call of captured) {
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers['user-agent'], 'm4-scam-checker/1.0');
    assert.match(headers['x-opencode-session'], /^ses_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  }
  const first = (captured[0].init.headers as Record<string, string>)['x-opencode-session'];
  const second = (captured[1].init.headers as Record<string, string>)['x-opencode-session'];
  assert.equal(first, second); // stable per provider instance — routing/prompt-cache continuity
});

test('accepts the top-level output_text convenience field', async () => {
  const provider = createResponsesProvider({
    apiKey: 'k',
    endpointUrl: ENDPOINT,
    model: 'm',
    fetchImpl: fakeFetch(() => jsonResponse({ output_text: JSON.stringify(VALID_REPLY) })),
  });
  assert.deepEqual(await provider.analyze('x'), { kind: 'ok', json: VALID_REPLY });
});

test('strips a markdown code fence before parsing', async () => {
  const fenced = '```json\n' + JSON.stringify(VALID_REPLY) + '\n```';
  const provider = createResponsesProvider({
    apiKey: 'k',
    endpointUrl: ENDPOINT,
    model: 'm',
    fetchImpl: fakeFetch(() => jsonResponse(responsesEnvelope(fenced))),
  });
  assert.deepEqual(await provider.analyze('x'), { kind: 'ok', json: VALID_REPLY });
});

test('non-2xx is an enum-only http-error (no body or key echoed)', async () => {
  const provider = createResponsesProvider({
    apiKey: 'secret-key',
    endpointUrl: ENDPOINT,
    model: 'm',
    fetchImpl: fakeFetch(() => jsonResponse({ error: { message: 'unauthorized' } }, 401)),
  });
  assert.deepEqual(await provider.analyze('x'), { kind: 'failed', failure: 'http-error' });
});

test('an envelope without assistant text is bad-json', async () => {
  const provider = createResponsesProvider({
    apiKey: 'k',
    endpointUrl: ENDPOINT,
    model: 'm',
    fetchImpl: fakeFetch(() => jsonResponse({ output: [] })),
  });
  assert.deepEqual(await provider.analyze('x'), { kind: 'failed', failure: 'bad-json' });
});

test('assistant text that is not JSON is bad-json', async () => {
  const provider = createResponsesProvider({
    apiKey: 'k',
    endpointUrl: ENDPOINT,
    model: 'm',
    fetchImpl: fakeFetch(() => jsonResponse(responsesEnvelope('not json at all'))),
  });
  assert.deepEqual(await provider.analyze('x'), { kind: 'failed', failure: 'bad-json' });
});

test('a deadline abort is reported as timeout', async () => {
  const provider = createResponsesProvider({
    apiKey: 'k',
    endpointUrl: ENDPOINT,
    model: 'm',
    deadlineMs: 5,
    fetchImpl: ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch,
  });
  assert.deepEqual(await provider.analyze('x'), { kind: 'failed', failure: 'timeout' });
});

test('buildResponsesPayload carries instructions and the submitted text only', () => {
  const payload = buildResponsesPayload('message', 'gpt-6.1-sol') as Record<string, unknown>;
  assert.equal(payload.model, 'gpt-6.1-sol');
  assert.equal(payload.input, 'message');
  assert.equal(typeof payload.instructions, 'string');
  assert.equal('messages' in payload, false, 'Responses API does not use chat messages');
});

test('extractResponsesText returns null for malformed envelopes', () => {
  for (const value of [null, 42, 'text', [], { output: 'nope' }, { output: [{ type: 'message', content: [] }] }]) {
    assert.equal(extractResponsesText(value), null);
  }
});

test('incomplete Responses output never becomes a verdict even when its JSON parses', async () => {
  for (const reason of ['max_output_tokens', 'content_filter']) {
    const diagnostics: AiFailure[] = [];
    const captured: Captured[] = [];
    const provider = createResponsesProvider({ apiKey: 'secret', endpointUrl: ENDPOINT, model: 'm',
      onDiagnostic: failure => diagnostics.push(failure),
      fetchImpl: fakeFetch(() => jsonResponse({ status: 'incomplete', incomplete_details: { reason },
        output_text: JSON.stringify(VALID_REPLY) }), captured) });
    assert.deepEqual(await provider.analyze('private'), { kind: 'failed', failure: 'bad-json' });
    assert.deepEqual(diagnostics, [{ code: reason === 'max_output_tokens' ? 'output-limit' : 'invalid-response' }]);
    assert.equal(captured.length, 1);
  }
});

test('Responses budgets enforce approved default and constructor bounds over payload values', async () => {
  for (const [setting, expected] of [[undefined, 4096], [512, 512], [8192, 8192], [511, 4096], [8193, 4096], [NaN, 4096]] as const) {
    const captured: Captured[] = [];
    const provider = createResponsesProvider({ apiKey: 'k', endpointUrl: ENDPOINT, model: 'm', maxOutputTokens: setting,
      buildPayload: () => ({ max_output_tokens: 999999 }),
      fetchImpl: fakeFetch(() => jsonResponse({ output_text: JSON.stringify(VALID_REPLY) }), captured) });
    await provider.analyze('x');
    assert.equal(JSON.parse(String(captured[0].init.body)).max_output_tokens, expected);
  }
});

test('Responses rate limits and provider errors expose only sanitized diagnostic codes', async () => {
  for (const status of [429, 400, 503]) {
    const diagnostics: AiFailure[] = [];
    const captured: Captured[] = [];
    const provider = createResponsesProvider({ apiKey: 'secret', endpointUrl: ENDPOINT, model: 'm',
      onDiagnostic: failure => diagnostics.push(failure),
      fetchImpl: fakeFetch(() => new Response('sensitive provider body', { status, headers: { 'retry-after': '30' } }), captured) });
    assert.deepEqual(await provider.analyze('private'), { kind: 'failed', failure: 'http-error' });
    assert.deepEqual(diagnostics, [status === 429 ? { code: 'rate-limited', retryAfterSeconds: 30 } : { code: 'provider-error' }]);
    assert.equal(captured.length, 1);
  }
});

test('Responses has a streamed body bound and reports a deadline during body reading as timeout', async () => {
  let cancelled = false;
  const diagnostics: AiFailure[] = [];
  const oversized = createResponsesProvider({ apiKey: 'k', endpointUrl: ENDPOINT, model: 'm',
    onDiagnostic: failure => diagnostics.push(failure),
    fetchImpl: fakeFetch(() => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(32768)); },
      cancel() { cancelled = true; },
    }))) });
  assert.deepEqual(await oversized.analyze('x'), { kind: 'failed', failure: 'bad-json' });
  assert.equal(cancelled, true);
  assert.deepEqual(diagnostics, [{ code: 'invalid-response' }]);
  const timeouts: AiFailure[] = [];
  const slow = createResponsesProvider({ apiKey: 'k', endpointUrl: ENDPOINT, model: 'm', deadlineMs: 5,
    onDiagnostic: failure => timeouts.push(failure),
    fetchImpl: (async (_url, init) => new Response(new ReadableStream({
      start(controller) { init?.signal?.addEventListener('abort', () => controller.error(new Error('body aborted')), { once: true }); },
    }))) as typeof fetch });
  assert.deepEqual(await slow.analyze('x'), { kind: 'failed', failure: 'timeout' });
  assert.deepEqual(timeouts, [{ code: 'timeout' }]);
});

test('Responses malformed data and network failures emit one diagnostic, and keys are trimmed', async () => {
  for (const invalid of ['not JSON', JSON.stringify({ output: [] }), JSON.stringify({ output_text: 'bad reply' })]) {
    const diagnostics: AiFailure[] = [];
    const provider = createResponsesProvider({ apiKey: 'k', endpointUrl: ENDPOINT, model: 'm',
      onDiagnostic: failure => diagnostics.push(failure), fetchImpl: fakeFetch(() => new Response(invalid)) });
    assert.deepEqual(await provider.analyze('x'), { kind: 'failed', failure: 'bad-json' });
    assert.deepEqual(diagnostics, [{ code: 'invalid-response' }]);
  }
  const failures: AiFailure[] = [];
  const broken = createResponsesProvider({ apiKey: 'secret', endpointUrl: ENDPOINT, model: 'm',
    onDiagnostic: failure => failures.push(failure), fetchImpl: fakeFetch(() => { throw new Error('secret'); }) });
  assert.deepEqual(await broken.analyze('x'), { kind: 'failed', failure: 'network' });
  assert.deepEqual(failures, [{ code: 'network' }]);
  const captured: Captured[] = [];
  await createResponsesProvider({ apiKey: ' key \n', endpointUrl: ENDPOINT, model: 'm',
    fetchImpl: fakeFetch(() => jsonResponse({ output_text: JSON.stringify(VALID_REPLY) }), captured) }).analyze('x');
  assert.equal((captured[0].init.headers as Record<string, string>).authorization, 'Bearer key');
  assert.deepEqual(await createResponsesProvider({ apiKey: ' \n', endpointUrl: ENDPOINT, model: 'm',
    fetchImpl: fakeFetch(() => { throw new Error('must not call'); }) }).analyze('x'), { kind: 'unconfigured' });
});
