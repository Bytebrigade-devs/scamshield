/**
 * M4-02 — check route handler tests (framework-neutral slice).
 *
 * Pins the HTTP mapping for unauthenticated/unavailable/denied/quota/input/analysed paths,
 * the "only text" body contract and the no-echo/no-provider-on-denial guarantees.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS_BLOCKED_MESSAGE, EMPTY_INPUT_MESSAGE } from './check-boundary.ts';
import type { CheckOutcome } from './check-boundary.ts';
import { createCheckRoute, parseCheckBody } from './route-handler.ts';
import type { M2SubscriptionDecision } from './m2-entitlement-adapter.ts';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const ALLOWED: M2SubscriptionDecision = {
  kind: 'verified',
  user: { id: 'subject-a' },
  entitlement: {
    canRunCheck: true, reason: 'valid_entitlement', planId: 'guardian', status: 'active',
    expiresAt: '2026-12-01T09:00:00.000Z', limits: null,
  },
};
const UNAUTHENTICATED: M2SubscriptionDecision = { kind: 'unauthenticated' };
const UNAVAILABLE: M2SubscriptionDecision = { kind: 'unavailable' };
const DENIED: M2SubscriptionDecision = {
  kind: 'verified', user: { id: 'subject-a' },
  entitlement: { canRunCheck: false, reason: 'subscription_required', planId: null, status: null, expiresAt: null, limits: null },
};

function analysedOutcome(): CheckOutcome {
  return {
    kind: 'analysed', analysisStatus: 'limited', analysisMode: 'rules_only', category: 'unknown_other',
    candidates: { urls: [], emails: [], phones: [] }, rules: { matches: [] }, reply: null,
    limitations: ['AI analysis was not completed'],
  };
}

function makeRoute(options: {
  decision?: M2SubscriptionDecision | null | undefined | (() => never);
  run?: (request: { text: unknown }, session: unknown) => Promise<CheckOutcome>;
} = {}) {
  let runCalls = 0;
  const route = createCheckRoute({
    now: () => NOW,
    resolveDecision: () => {
      if (typeof options.decision === 'function') (options.decision as () => never)();
      return options.decision === undefined ? ALLOWED : options.decision;
    },
    run: async (request, session) => {
      runCalls++;
      return options.run ? options.run(request, session) : analysedOutcome();
    },
  });
  return { route, runCalls: () => runCalls };
}

test('only POST is accepted', async () => {
  const { route } = makeRoute();
  const response = await route({ method: 'GET', body: { text: 'hello' }, session: {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'POST');
});

test('body parsing accepts exactly one non-empty text field', () => {
  assert.deepEqual(parseCheckBody({ text: 'hello' }), { ok: true, text: 'hello' });
  assert.deepEqual(parseCheckBody({ text: '  ' }), { ok: false, message: EMPTY_INPUT_MESSAGE });
  assert.deepEqual(parseCheckBody({ text: 'hi', sender: 'x' }), { ok: false, message: 'Only the message text is accepted.' });
  assert.deepEqual(parseCheckBody({ message: 'hi' }), { ok: false, message: 'Only the message text is accepted.' });
  assert.deepEqual(parseCheckBody([]), { ok: false, message: 'Only the message text is accepted.' });
  assert.deepEqual(parseCheckBody(null), { ok: false, message: 'Only the message text is accepted.' });
  assert.deepEqual(parseCheckBody('hi'), { ok: false, message: 'Only the message text is accepted.' });
});

test('malformed body returns 400 without running the check', async () => {
  const { route, runCalls } = makeRoute();
  const response = await route({ method: 'POST', body: { text: 'hi', extra: true }, session: {} });
  assert.equal(response.status, 400);
  assert.equal(runCalls(), 0);
});

test('unauthenticated maps to 401 and unavailable to 503 without running the check', async () => {
  const unauth = makeRoute({ decision: UNAUTHENTICATED });
  assert.equal((await unauth.route({ method: 'POST', body: { text: 'hi' }, session: {} })).status, 401);
  assert.equal(unauth.runCalls(), 0);

  const unavailable = makeRoute({ decision: UNAVAILABLE });
  assert.equal((await unavailable.route({ method: 'POST', body: { text: 'hi' }, session: {} })).status, 503);
  assert.equal(unavailable.runCalls(), 0);
});

test('a denied M2 decision maps to 403 with the access message', async () => {
  const { route, runCalls } = makeRoute({ decision: DENIED });
  const response = await route({ method: 'POST', body: { text: 'hi' }, session: {} });
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: ACCESS_BLOCKED_MESSAGE });
  assert.equal(runCalls(), 0);
});

test('a throwing decision resolver fails closed with 503', async () => {
  const { route } = makeRoute({ decision: () => { throw new Error('supabase down'); } });
  const response = await route({ method: 'POST', body: { text: 'hi' }, session: {} });
  assert.equal(response.status, 503);
});

test('boundary rejections map to 400/403/429 with safe messages', async () => {
  const invalid = makeRoute({ run: async () => ({ kind: 'rejected', reason: 'invalid-input', message: 'Too long.' }) });
  assert.deepEqual((await invalid.route({ method: 'POST', body: { text: 'hi' }, session: {} })).body, { error: 'Too long.' });

  const blocked = makeRoute({ run: async () => ({ kind: 'rejected', reason: 'access-blocked', message: ACCESS_BLOCKED_MESSAGE }) });
  assert.equal((await blocked.route({ method: 'POST', body: { text: 'hi' }, session: {} })).status, 403);

  const quota = makeRoute({ run: async () => ({ kind: 'rejected', reason: 'quota-denied', message: 'Monthly limit reached.' }) });
  const quotaResponse = await quota.route({ method: 'POST', body: { text: 'hi' }, session: {} });
  assert.equal(quotaResponse.status, 429);
  assert.deepEqual(quotaResponse.body, { error: 'Monthly limit reached.', reason: 'quota-denied' });

  const burst = makeRoute({ run: async () => ({ kind: 'rejected', reason: 'rate-denied', message: 'Too many checks.' }) });
  assert.equal((await burst.route({ method: 'POST', body: { text: 'hi' }, session: {} })).status, 429);
});

test('an analysed outcome returns 200 with the outcome and no-store headers', async () => {
  const { route, runCalls } = makeRoute();
  const response = await route({ method: 'POST', body: { text: 'hello' }, session: { token: 'x' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal((response.body as { outcome: CheckOutcome }).outcome.kind, 'analysed');
  assert.equal(runCalls(), 1);
});

test('a throwing boundary run fails closed with 503', async () => {
  const { route } = makeRoute({ run: async () => { throw new Error('boom'); } });
  const response = await route({ method: 'POST', body: { text: 'hi' }, session: {} });
  assert.equal(response.status, 503);
});

test('error responses never echo the submitted text or internal diagnostics', async () => {
  const secret = 'SECRET_MESSAGE_TOKEN https://private.example +94771234567';
  for (const decision of [UNAUTHENTICATED, UNAVAILABLE, DENIED]) {
    const { route } = makeRoute({ decision });
    const response = await route({ method: 'POST', body: { text: secret }, session: {} });
    assert.doesNotMatch(JSON.stringify(response.body), /SECRET_MESSAGE_TOKEN|private\.example|94771234567/);
  }
  const invalid = makeRoute({ run: async () => ({ kind: 'rejected', reason: 'invalid-input', message: 'Too long.' }) });
  const response = await invalid.route({ method: 'POST', body: { text: secret }, session: {} });
  assert.doesNotMatch(JSON.stringify(response.body), /SECRET_MESSAGE_TOKEN/);
});

test('the handler performs no network I/O or env reads', async () => {
  const source = readFileSync(new URL('./route-handler.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /process\.env\./);
});
