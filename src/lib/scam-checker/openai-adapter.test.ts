/**
 * M4-02 — OpenAI provider adapter tests.
 *
 * Requirements pinned: FS-M4-05/NFR-M4-01 (missing key disables live use with zero fetch
 * calls; the key never appears in any result), FR-M4-04 (unparseable JSON is a failure,
 * never a successful result), FS-M4-06 (deadline abort → timeout), and the M4-02 task rule
 * "key only in server env vars" (the key arrives as a constructor argument and leaves only
 * in the Authorization header of the single request).
 *
 * NO NETWORK: every test injects `fetchImpl`. The single-attempt rule (owner decision
 * 19 Oct 2026) is pinned by counting stub calls.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIProvider, DEFAULT_MODEL } from './openai-adapter.ts';
import type { ProviderAttempt } from './check-boundary.ts';

const API_KEY = 'test-key-server-side-only';

interface RecordedInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** Minimal Response-like + recorder; cast to typeof fetch for injection. */
function stubFetch(handler: (url: string, init: RecordedInit) => Promise<unknown>): {
  calls: { url: string; init: RecordedInit }[];
  fetchImpl: typeof fetch;
} {
  const calls: { url: string; init: RecordedInit }[] = [];
  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RecordedInit });
    return handler(String(url), (init ?? {}) as RecordedInit);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const okJson = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200 });

/** Realistic chat-completions envelope: the reply JSON rides in choices[0].message.content as a string. */
const envelopeOf = (reply: unknown) =>
  ({ id: 'chatcmpl-1', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(reply) } }] });

test('FS-M4-05: an absent key returns unconfigured with zero fetch calls', async () => {
  const { calls, fetchImpl } = stubFetch(() => Promise.resolve(okJson({})));
  const provider = createOpenAIProvider({ apiKey: undefined, fetchImpl });
  const attempt = await provider.analyze('any text');
  assert.deepEqual(attempt, { kind: 'unconfigured' });
  assert.equal(calls.length, 0, 'live provider use is disabled when the key is missing');
});

test('FR-M4-04: a 2xx JSON reply is returned as ok — one call, key only in the Authorization header', async () => {
  const reply = { verdict: 'suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft' };
  const { calls, fetchImpl } = stubFetch(() => Promise.resolve(okJson(envelopeOf(reply))));
  const provider = createOpenAIProvider({ apiKey: API_KEY, fetchImpl });
  const attempt: ProviderAttempt = await provider.analyze('check this message');

  assert.deepEqual(attempt, { kind: 'ok', json: reply });
  assert.equal(calls.length, 1, 'exactly one fetch per analyze call');
  const init = calls[0].init;
  assert.equal(init.method, 'POST');
  assert.equal(init.headers?.authorization, `Bearer ${API_KEY}`);
  assert.equal(init.headers?.['content-type'], 'application/json');

  const payload = JSON.parse(init.body ?? '{}') as { model?: string; messages?: { role: string; content: string }[] };
  assert.equal(payload.model, DEFAULT_MODEL, `default model is ${DEFAULT_MODEL}`);
  assert.ok(payload.messages?.some((m) => m.role === 'user' && m.content === 'check this message'));
  // The key appears nowhere else in the request or the attempt.
  assert.ok(!JSON.stringify(attempt).includes(API_KEY));
});

// --- Review fix #1 (24 Oct 2026): the reply is extracted from choices[0].message.content ---

test('review #1: a raw reply object at the top level is NOT the reply — envelope extraction is required', async () => {
  const reply = { verdict: 'suspicious', taxonomy_version: '0.1.0-draft' };
  const { fetchImpl } = stubFetch(() => Promise.resolve(okJson(reply)));
  const attempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl }).analyze('x');
  assert.deepEqual(attempt, { kind: 'failed', failure: 'bad-json' });
});

test('review #1: malformed envelopes (no choices, empty choices, non-string content, bad inner JSON) are bad-json', async () => {
  const cases: unknown[] = [
    {},
    { choices: [] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: 42 } }] },
    { choices: [{ message: { content: 'not inner json {' } }] },
    'a plain string',
  ];
  for (const envelope of cases) {
    const { fetchImpl } = stubFetch(() => Promise.resolve(okJson(envelope)));
    const attempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl }).analyze('x');
    assert.deepEqual(attempt, { kind: 'failed', failure: 'bad-json' }, JSON.stringify(envelope));
  }
});

test('a custom buildPayload and model are honoured (DRAFT payload seam for OD-M4-04)', async () => {
  const { calls, fetchImpl } = stubFetch(() => Promise.resolve(okJson({})));
  const provider = createOpenAIProvider({
    apiKey: API_KEY,
    model: 'candidate-model',
    fetchImpl,
    buildPayload: (text, model) => ({ model, custom: true, text }),
  });
  await provider.analyze('hello');
  const payload = JSON.parse(calls[0].init.body ?? '{}') as Record<string, unknown>;
  assert.deepEqual(payload, { model: 'candidate-model', custom: true, text: 'hello', max_completion_tokens: 1_000 });
});

test('FR-M4-04: a non-2xx status is http-error and an unparseable body is bad-json — never ok', async () => {
  const http = stubFetch(() => Promise.resolve(new Response('server error', { status: 500 })));
  const httpAttempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl: http.fetchImpl }).analyze('x');
  assert.deepEqual(httpAttempt, { kind: 'failed', failure: 'http-error' });

  const bad = stubFetch(() => Promise.resolve(new Response('not json {', { status: 200 })));
  const badAttempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl: bad.fetchImpl }).analyze('x');
  assert.deepEqual(badAttempt, { kind: 'failed', failure: 'bad-json' });
});

test('a network exception is reported as network, and the key never leaks into results', async () => {
  const { fetchImpl } = stubFetch(() => Promise.reject(new TypeError('fetch failed')));
  const attempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl }).analyze('x');
  assert.deepEqual(attempt, { kind: 'failed', failure: 'network' });
  assert.ok(!JSON.stringify(attempt).includes(API_KEY));
});

test('FS-M4-06: a deadline abort is a timeout failure with exactly one attempt', async () => {
  const { calls, fetchImpl } = stubFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  );
  const provider = createOpenAIProvider({ apiKey: API_KEY, fetchImpl, deadlineMs: 10 });
  const attempt = await provider.analyze('slow provider');
  assert.deepEqual(attempt, { kind: 'failed', failure: 'timeout' });
  assert.equal(calls.length, 1, 'no second attempt after a timeout — no retry, no fallback model');
});

test('review hardening: whitespace-only keys disable fetch and surrounding whitespace is removed', async () => {
  const { calls, fetchImpl } = stubFetch(() => Promise.resolve(okJson(envelopeOf({ verdict: 'suspicious' }))));
  for (const apiKey of ['', ' ', '\r\n\t']) {
    assert.deepEqual(await createOpenAIProvider({ apiKey, fetchImpl }).analyze('x'), { kind: 'unconfigured' });
  }
  assert.equal(calls.length, 0);
  await createOpenAIProvider({ apiKey: ` ${API_KEY}\n`, fetchImpl }).analyze('x');
  assert.equal(calls[0].init.headers?.authorization, `Bearer ${API_KEY}`);
});

test('review hardening: default and custom payloads cannot remove or increase the output-token bound', async () => {
  for (const buildPayload of [undefined, () => ({ model: 'candidate', max_completion_tokens: 100_000 })]) {
    const { calls, fetchImpl } = stubFetch(() => Promise.resolve(okJson(envelopeOf({ verdict: 'suspicious' }))));
    await createOpenAIProvider({ apiKey: API_KEY, fetchImpl, buildPayload }).analyze('x');
    assert.equal(JSON.parse(calls[0].init.body ?? '{}').max_completion_tokens, 1_000);
    if (!buildPayload) {
      const payload = JSON.parse(calls[0].init.body ?? '{}');
      assert.match(payload.messages[0].content, /0\.1\.0-draft/);
      assert.match(payload.messages[0].content, /no obvious indicators/i);
    }
  }
});

test('review hardening: oversized streamed responses are cancelled before parsing regardless of Content-Length', async () => {
  for (const advertised of [undefined, '1']) {
    let cancelled = false;
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks === 8) { controller.close(); return; }
        chunks += 1;
        controller.enqueue(new Uint8Array(32_768).fill(120));
      },
      cancel() { cancelled = true; },
    });
    const { calls, fetchImpl } = stubFetch(() => Promise.resolve(new Response(body, {
      headers: advertised ? { 'content-length': advertised } : {},
    })));
    const attempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl }).analyze('x');
    assert.deepEqual(attempt, { kind: 'failed', failure: 'bad-json' });
    assert.ok(cancelled, 'do not buffer the remaining body');
    assert.ok(chunks <= 4, 'only a bounded prefix, plus stream prefetch, is read');
    assert.equal(calls.length, 1);
  }
});

test('review hardening: response byte limit accepts exactly 64 KiB and rejects one byte more', async () => {
  const reply = { verdict: 'suspicious' };
  const json = JSON.stringify(envelopeOf(reply));
  for (const extra of [0, 1]) {
    const padded = json + ' '.repeat(65_536 + extra - new TextEncoder().encode(json).length);
    const { fetchImpl } = stubFetch(() => Promise.resolve(new Response(padded)));
    const attempt = await createOpenAIProvider({ apiKey: API_KEY, fetchImpl }).analyze('x');
    assert.deepEqual(attempt, extra ? { kind: 'failed', failure: 'bad-json' } : { kind: 'ok', json: reply });
  }
});

test('review hardening: split UTF-8 chunks decode intact within the byte cap', async () => {
  const reply = { verdict: 'suspicious', reason: 'සිංහල 😀' };
  const bytes = new TextEncoder().encode(JSON.stringify(envelopeOf(reply)));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const { fetchImpl } = stubFetch(() => Promise.resolve(new Response(body)));
  assert.deepEqual(await createOpenAIProvider({ apiKey: API_KEY, fetchImpl }).analyze('x'), { kind: 'ok', json: reply });
});

test('review hardening: a deadline during body reading is a timeout, and a broken body is a network failure', async () => {
  const slow = stubFetch((_url, init) => Promise.resolve(new Response(new ReadableStream({
    start(controller) {
      init.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
    },
  }))));
  assert.deepEqual(await createOpenAIProvider({ apiKey: API_KEY, fetchImpl: slow.fetchImpl, deadlineMs: 10 }).analyze('x'),
    { kind: 'failed', failure: 'timeout' });
  const broken = stubFetch(() => Promise.resolve(new Response(new ReadableStream({
    start(controller) { controller.error(new Error('connection lost')); },
  }))));
  assert.deepEqual(await createOpenAIProvider({ apiKey: API_KEY, fetchImpl: broken.fetchImpl }).analyze('x'),
    { kind: 'failed', failure: 'network' });
});
