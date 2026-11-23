/**
 * M4 — demo entitlement resolver tests (no network).
 *
 * Pins the two reads (auth, own-row subscription), the mirror of M2's evaluation, and the
 * fail-closed rule: missing configuration, a refusal from Supabase or a network failure must
 * never look like entitlement. A fake `fetch` stands in for Supabase.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_ENTITLEMENT_ENV, evaluateDemoEntitlement, resolveDemoDecision,
} from './demo-entitlement.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'test-access-token-value';
const ENV = { url: 'https://project.supabase.co', anonKey: 'anon-key-for-tests' };

const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

type Captured = { url?: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fetch double that answers by URL prefix and records the last call. */
function fakeFetch(answer: (url: string, init?: RequestInit) => Response, captured: Captured = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    captured.url = url;
    captured.init = init;
    return answer(url, init);
  }) as unknown as typeof fetch;
}

function happyFetch(subscription: unknown, captured: Captured = {}): typeof fetch {
  return fakeFetch((url) => (url.includes('/auth/v1/user')
    ? jsonResponse({ id: USER_ID })
    : jsonResponse(subscription === undefined ? [] : [subscription])), captured);
}

function request(authorization?: string): Request {
  return new Request('https://demo.netlify.app/api/check', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization === undefined ? {} : { authorization }),
    },
    body: JSON.stringify({ text: 'a message' }),
  });
}

function subscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: USER_ID, plan: 'guardian', status: 'active', billing_cycle: 'monthly',
    started_at: iso(-2 * DAY), renews_at: iso(28 * DAY), cancelled_at: null,
    ...overrides,
  };
}

const allowed = (decision: unknown): boolean =>
  Boolean((decision as { entitlement?: { canRunCheck?: unknown } }).entitlement?.canRunCheck);

test('missing configuration is unavailable, and nothing is fetched', async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls += 1; return jsonResponse({}); }) as unknown as typeof fetch;

  for (const env of [{}, { url: ENV.url }, { anonKey: ENV.anonKey }]) {
    const decision = await resolveDemoDecision(request(`Bearer ${TOKEN}`), { env, fetchImpl });
    assert.equal(decision.kind, 'unavailable', JSON.stringify(env));
  }
  assert.equal(calls, 0);
});

test('the environment variable names are the shared app’s names', () => {
  assert.equal(DEMO_ENTITLEMENT_ENV.url, 'NEXT_PUBLIC_SUPABASE_URL');
  assert.equal(DEMO_ENTITLEMENT_ENV.anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
});

test('a header without a bearer token is unauthenticated', async () => {
  const decision = await resolveDemoDecision(request('Basic abc'), { env: ENV, fetchImpl: happyFetch(subscription()) });
  assert.equal(decision.kind, 'unauthenticated');
});

test('a token Supabase refuses is unauthenticated, not unavailable', async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({ message: 'invalid JWT' }, 401));
  const decision = await resolveDemoDecision(request(`Bearer ${TOKEN}`), { env: ENV, fetchImpl });
  assert.equal(decision.kind, 'unauthenticated');
});

test('a network failure, a 5xx or a missing id all fail closed as unavailable', async () => {
  const throwing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
  assert.equal((await resolveDemoDecision(request(`Bearer ${TOKEN}`), { env: ENV, fetchImpl: throwing })).kind, 'unavailable');

  const serverError = fakeFetch(() => jsonResponse({}, 500));
  assert.equal((await resolveDemoDecision(request(`Bearer ${TOKEN}`), { env: ENV, fetchImpl: serverError })).kind, 'unavailable');

  const noId = fakeFetch(() => jsonResponse({ email: 'x@example.invalid' }));
  assert.equal((await resolveDemoDecision(request(`Bearer ${TOKEN}`), { env: ENV, fetchImpl: noId })).kind, 'unauthenticated');
});

test('the subscription read sends the caller token and filters by the verified user', async () => {
  const captured: Captured = {};
  const decision = await resolveDemoDecision(request(`Bearer ${TOKEN}`), {
    env: ENV, fetchImpl: happyFetch(subscription(), captured), now: () => NOW,
  });

  assert.equal(decision.kind, 'verified');
  assert.ok(captured.url?.startsWith(`${ENV.url}/rest/v1/subscriptions?`), captured.url);
  assert.ok(captured.url?.includes(`user_id=eq.${USER_ID}`), captured.url);
  assert.ok(captured.url?.includes('select=user_id,plan,status'), captured.url);

  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers.apikey, ENV.anonKey);
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(
    captured.init?.method,
    undefined,
    'a read must not send a method/body',
  );
});

test('a database error during the subscription read is unavailable', async () => {
  const fetchImpl = fakeFetch((url) => (url.includes('/auth/v1/user')
    ? jsonResponse({ id: USER_ID })
    : jsonResponse({ message: 'permission denied' }, 403)));
  const decision = await resolveDemoDecision(request(`Bearer ${TOKEN}`), { env: ENV, fetchImpl });
  assert.equal(decision.kind, 'unavailable');
});

test('entitled states allow the check; a missing row does not', async () => {
  const cases: Array<[string, unknown, boolean]> = [
    ['active paid', subscription(), true],
    ['trialing', subscription({ plan: 'sentinel', status: 'trialing', billing_cycle: null }), true],
    ['cancelled before expiry', subscription({ status: 'cancelled', cancelled_at: iso(-DAY) }), true],
    ['expired active', subscription({ renews_at: iso(-10 * DAY) }), false],
    ['cancelled after expiry', subscription({ status: 'cancelled', renews_at: iso(-DAY) }), false],
    ['suspended', subscription({ status: 'suspended' }), false],
    ['past due', subscription({ status: 'past_due' }), false],
    ['unknown plan', subscription({ plan: 'free' }), false],
    ['starts in the future', subscription({ started_at: iso(DAY), renews_at: iso(30 * DAY) }), false],
    ['no subscription row', undefined, false],
  ];

  for (const [label, row, expected] of cases) {
    const decision = await resolveDemoDecision(request(`Bearer ${TOKEN}`), {
      env: ENV, fetchImpl: happyFetch(row), now: () => NOW,
    });
    assert.equal(decision.kind, 'verified', label);
    assert.equal(allowed(decision), expected, label);
  }
});

test('evaluation mirrors M2: plan, status, started window and future expiry', () => {
  const decision = evaluateDemoEntitlement(subscription(), NOW);
  assert.deepEqual(decision, {
    canRunCheck: true,
    reason: 'valid_entitlement',
    planId: 'guardian',
    status: 'active',
    expiresAt: iso(28 * DAY),
    limits: null,
  });

  const denied = evaluateDemoEntitlement(null, NOW);
  assert.equal(denied.canRunCheck, false);
  assert.equal(denied.reason, 'subscription_required');
  assert.equal(denied.planId, null);
});

test('the decision never carries the anon key or the caller token', async () => {
  const decision = await resolveDemoDecision(request(`Bearer ${TOKEN}`), {
    env: ENV, fetchImpl: happyFetch(subscription()), now: () => NOW,
  });
  const serialised = JSON.stringify(decision);
  assert.equal(serialised.includes(ENV.anonKey), false);
  assert.equal(serialised.includes(TOKEN), false);
});
