/**
 * M4 — persistence selection tests.
 *
 * Pins the fail-closed rule: asking for the durable store without a usable configuration throws
 * instead of silently running in memory, and no error message ever carries a value. The selection
 * must also return a *working* adapter in both modes, which is what makes "one env var away" a
 * real claim rather than a hopeful one.
 *
 * No network, no database, no clock: the durable mode is exercised through an injected transport.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSISTENCE_ENV, describePersistence, selectPersistence,
} from './persistence-mode.ts';
import type { PostgrestRequest, PostgrestTransport } from './postgrest-client.ts';
import type { StoredCheckInput } from './persistence-port.ts';
import { TAXONOMY_VERSION } from './taxonomy.ts';

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
const DAY_MS = 86_400_000;
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const SERVICE_KEY = 'sb_secret_selection_test_only';

function checkInput(overrides: Partial<StoredCheckInput> = {}): StoredCheckInput {
  return {
    checkId: 'chk_mode_0001',
    subjectKey: SUBJECT,
    planId: 'sentinel',
    createdAt: NOW,
    expiresAt: NOW + 30 * DAY_MS,
    analysisStatus: 'completed',
    analysisMode: 'rules_and_ai',
    categoryId: 'phishing',
    taxonomyVersion: TAXONOMY_VERSION,
    verdictLabel: 'high risk',
    riskLevel: 'high',
    reason: 'A shortened link asks for banking details.',
    reasonHighlights: [],
    limitations: [],
    findings: [],
    history: null,
    ...overrides,
  };
}

/** Minimal transport double: records requests and answers every read with an empty list. */
function emptyTransport(): { transport: PostgrestTransport; requests: PostgrestRequest[] } {
  const requests: PostgrestRequest[] = [];
  return {
    requests,
    transport: {
      async request(request) {
        requests.push(request);
        return { status: 200, body: [] };
      },
    },
  };
}

test('unset, 0 and false all select the in-memory store', () => {
  for (const env of [
    {},
    { [PERSISTENCE_ENV.enabled]: '' },
    { [PERSISTENCE_ENV.enabled]: '0' },
    { [PERSISTENCE_ENV.enabled]: 'false' },
    { [PERSISTENCE_ENV.enabled]: 'FALSE' },
  ]) {
    const selection = selectPersistence(env);
    assert.equal(selection.mode, 'memory', JSON.stringify(env));
    assert.equal(describePersistence(selection), 'in-memory store selected (demo/test; nothing persisted)');
  }
});

test('the in-memory selection is a working adapter, not a stub', async () => {
  const { persistence } = selectPersistence({});
  const saved = await persistence.checks.save(checkInput());
  assert.ok(saved);
  const owned = await persistence.checks.getOwned('chk_mode_0001', SUBJECT, NOW);
  assert.ok(owned, 'own-row read works through the async wrapper');
  assert.equal(owned.findings.length, 0);
  assert.equal(await persistence.checks.getOwned('chk_mode_0001', 'someone-else', NOW), null);
});

test('an unrecognised flag is refused, naming the variable and its accepted values', () => {
  assert.throws(
    () => selectPersistence({ [PERSISTENCE_ENV.enabled]: 'yes' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /M4_DURABLE_STORE="yes" is not recognised/);
      assert.match(error.message, /1\/true/);
      return true;
    },
  );
});

test('durable without its configuration throws instead of degrading to memory', () => {
  assert.throws(
    () => selectPersistence({ [PERSISTENCE_ENV.enabled]: '1' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /M4_SUPABASE_URL and M4_SUPABASE_SERVICE_ROLE_KEY is not set/);
      assert.match(error.message, /rows would be lost on restart/);
      return true;
    },
  );

  assert.throws(
    () => selectPersistence({
      [PERSISTENCE_ENV.enabled]: '1',
      [PERSISTENCE_ENV.url]: 'https://example.supabase.co',
    }),
    /M4_SUPABASE_SERVICE_ROLE_KEY is not set/,
    'only the missing variable is named',
  );
});

test('durable refuses a public/anon key and a plain-http project URL', () => {
  assert.throws(
    () => selectPersistence({
      [PERSISTENCE_ENV.enabled]: '1',
      [PERSISTENCE_ENV.url]: 'https://example.supabase.co',
      [PERSISTENCE_ENV.serviceRoleKey]: 'sb_publishable_not_the_service_role',
    }),
    /Refusing to build the durable transport with a public\/anon key/,
  );

  assert.throws(
    () => selectPersistence({
      [PERSISTENCE_ENV.enabled]: '1',
      [PERSISTENCE_ENV.url]: 'http://example.supabase.co',
      [PERSISTENCE_ENV.serviceRoleKey]: SERVICE_KEY,
    }),
    /requires https/,
  );
});

test('no error message echoes a configured value', () => {
  const attempts: Array<Record<string, string>> = [
    { [PERSISTENCE_ENV.enabled]: 'yes' },
    {
      [PERSISTENCE_ENV.enabled]: '1',
      [PERSISTENCE_ENV.url]: 'https://example.supabase.co',
      [PERSISTENCE_ENV.serviceRoleKey]: `${SERVICE_KEY}.leaky-suffix`,
    },
  ];
  for (const env of attempts) {
    try {
      selectPersistence(env);
      assert.fail('expected a refusal');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(SERVICE_KEY), 'the key must not appear in the message');
      assert.ok(!error.message.includes('leaky-suffix'), 'no value fragment may appear');
    }
  }
});

test('a complete configuration selects the durable store and drives the injected transport', async () => {
  const { transport, requests } = emptyTransport();
  const selection = selectPersistence(
    {
      [PERSISTENCE_ENV.enabled]: '1',
      [PERSISTENCE_ENV.url]: 'https://example.supabase.co',
      [PERSISTENCE_ENV.serviceRoleKey]: SERVICE_KEY,
    },
    { transport, now: () => NOW },
  );

  assert.equal(selection.mode, 'durable');
  assert.equal(describePersistence(selection), 'durable store selected (PostgREST, service role)');

  const entries = await selection.persistence.history.listOwned(SUBJECT, NOW);
  assert.deepEqual(entries, []);
  assert.equal(requests.length, 1, 'the selected adapter really used the injected transport');
  assert.equal(requests[0]!.method, 'GET');
  assert.equal(requests[0]!.path, '/checker_history');
  assert.equal(requests[0]!.query?.user_id, `eq.${SUBJECT}`);
});

test('durable mode passes the caller-supplied clock through to deleteSubject', async () => {
  const requests: PostgrestRequest[] = [];
  const transport: PostgrestTransport = {
    async request(request) {
      requests.push(request);
      return { status: 200, body: { checks: 0, history: 0, feedback: 0, quota_buckets: 0, reservations: 0, events: 0 } };
    },
  };
  const selection = selectPersistence(
    {
      [PERSISTENCE_ENV.enabled]: '1',
      [PERSISTENCE_ENV.url]: 'https://example.supabase.co',
      [PERSISTENCE_ENV.serviceRoleKey]: SERVICE_KEY,
    },
    { transport, now: () => NOW },
  );

  const counts = await selection.persistence.deleteSubject(SUBJECT);
  assert.deepEqual(counts, { checks: 0, history: 0, feedback: 0, quotaBuckets: 0, reservations: 0, events: 0 });
  const call = requests.find((request) => request.path === '/rpc/m4_delete_subject');
  assert.ok(call, 'deleteSubject must call the reviewed transaction function');
  assert.deepEqual(call!.body, { p_user: SUBJECT, p_now: new Date(NOW).toISOString() });
});
