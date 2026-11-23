/**
 * M4 — PostgREST transport tests (no network).
 *
 * Pins the server-only seam: the transport must refuse a non-service-role key, refuse plain
 * http off localhost, build PostgREST-shaped requests, and never leak the key into an error.
 * A fake `fetch` stands in for the network — nothing here opens a socket.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PostgrestConfigError, PostgrestError, assertServiceRoleKey, createFetchTransport, keyRole,
  type PostgrestRequest,
} from './postgrest-client.ts';

const SERVICE_KEY = 'sb_secret_test_only_value';
const ANON_KEY = 'sb_publishable_test_only_value';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function fakeFetch(
  status: number,
  body: unknown,
  capture?: { url?: string; init?: RequestInit },
): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    if (capture) {
      capture.url = String(url);
      capture.init = init;
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

test('key classification: legacy JWT roles, new secret prefixes, and junk', () => {
  assert.equal(keyRole(jwt({ role: 'service_role' })), 'service_role');
  assert.equal(keyRole(jwt({ role: 'anon' })), 'anon');
  assert.equal(keyRole(jwt({ role: 'authenticated' })), 'anon');
  assert.equal(keyRole(SERVICE_KEY), 'service_role');
  assert.equal(keyRole(ANON_KEY), 'anon');
  assert.equal(keyRole(''), 'unknown');
  assert.equal(keyRole('not-a-key'), 'unknown');
  assert.equal(keyRole('a.b.c'), 'unknown', 'undecodable JWT payload is not trusted');
});

test('the transport refuses an anon key and an unrecognised key', () => {
  const endpoint = { url: 'https://example.supabase.co', serviceRoleKey: ANON_KEY };
  assert.throws(() => createFetchTransport(endpoint, fakeFetch(200, [])), PostgrestConfigError);
  assert.throws(
    () => createFetchTransport({ url: 'https://example.supabase.co', serviceRoleKey: 'junk' }, fakeFetch(200, [])),
    PostgrestConfigError,
  );
  assert.throws(() => assertServiceRoleKey(ANON_KEY), PostgrestConfigError);
  assert.doesNotThrow(() => assertServiceRoleKey(jwt({ role: 'service_role' })));
});

test('plain http is accepted only for localhost', () => {
  assert.throws(
    () => createFetchTransport({ url: 'http://example.supabase.co', serviceRoleKey: SERVICE_KEY }, fakeFetch(200, [])),
    PostgrestConfigError,
  );
  assert.doesNotThrow(
    () => createFetchTransport({ url: 'http://localhost:54321', serviceRoleKey: SERVICE_KEY }, fakeFetch(200, [])),
  );
});

test('requests carry the PostgREST shape: /rest/v1 path, apikey, bearer and Prefer', async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  const transport = createFetchTransport(
    { url: 'https://example.supabase.co/', serviceRoleKey: SERVICE_KEY },
    fakeFetch(200, [{ id: 'x' }], capture),
  );

  const request: PostgrestRequest = {
    method: 'POST',
    path: '/rpc/m4_reserve_check',
    body: { p_subject: 'subject-1' },
    prefer: ['return=representation', 'resolution=merge-duplicates'],
  };
  const response = await transport.request(request);

  assert.deepEqual(response, { status: 200, body: [{ id: 'x' }] });
  assert.ok(capture.url?.startsWith('https://example.supabase.co/rest/v1/rpc/m4_reserve_check'), capture.url);
  const headers = capture.init?.headers as Record<string, string>;
  assert.equal(headers.apikey, SERVICE_KEY);
  assert.equal(headers.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Prefer, 'return=representation,resolution=merge-duplicates');
  assert.equal(capture.init?.body, JSON.stringify({ p_subject: 'subject-1' }));
});

test('query parameters are encoded, and a body-less request sends no content type', async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  const transport = createFetchTransport(
    { url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY },
    fakeFetch(200, [], capture),
  );

  await transport.request({
    method: 'GET',
    path: '/scam_checks',
    query: { id: 'eq.check 1', expires_at: 'gt.2026-11-19T12:00:00.000Z' },
  });

  assert.ok(capture.url?.includes('id=eq.check+1'), capture.url);
  assert.ok(capture.url?.includes('expires_at=gt.2026-11-19T12%3A00%3A00.000Z'), capture.url);
  const headers = capture.init?.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], undefined);
  assert.equal(capture.init?.body, undefined);
});

test('a non-2xx response becomes a PostgrestError carrying status and code', async () => {
  const transport = createFetchTransport(
    { url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY },
    fakeFetch(409, { code: '23505', message: 'duplicate key value violates unique constraint' }),
  );

  await assert.rejects(
    () => transport.request({ method: 'POST', path: '/checker_usage_events', body: {} }),
    (error: unknown) => {
      assert.ok(error instanceof PostgrestError);
      assert.equal(error.status, 409);
      assert.equal(error.code, '23505');
      return true;
    },
  );
});

test('a JSON string body is preserved: scalar text results are real values', async () => {
  // Regression from the 24 Nov 2026 live test: `m4_save_check` returns the check id as a JSON
  // string, and the transport used to null it, making `checks.save` always return null.
  const transport = createFetchTransport(
    { url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY },
    fakeFetch(200, '"chk-abc-123"'),
  );
  const response = await transport.request({ method: 'POST', path: '/rpc/m4_save_check', body: {} });
  assert.deepEqual(response, { status: 200, body: 'chk-abc-123' });
});

test('the service-role key is redacted if it ever appears in an error body', async () => {
  const transport = createFetchTransport(
    { url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY },
    fakeFetch(400, { code: 'XX000', message: `bad request for key ${SERVICE_KEY}` }),
  );

  await assert.rejects(
    () => transport.request({ method: 'GET', path: '/scam_checks' }),
    (error: unknown) => {
      assert.ok(error instanceof PostgrestError);
      assert.ok(!error.message.includes(SERVICE_KEY), 'key must not survive in the message');
      assert.ok(error.message.includes('[redacted]'));
      return true;
    },
  );
});
