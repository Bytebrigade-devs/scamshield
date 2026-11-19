// Compile the isolated policy modules and test expiry/limits without real accounts.
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
function load(file, dependencies = {}, environment = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => dependencies[name], Date, Object, Number, Math, Error, ...environment });
  return exports;
}
const plans = load('src/lib/plans.ts');
const paymentMethods = load('src/lib/payment-methods.ts');
const testCards = load('src/lib/test-cards.ts');
const { evaluateEntitlement, billingEnd } = load('src/lib/entitlement.ts', { './plans': plans });
const now = Date.parse('2026-10-18T12:00:00Z');
const row = { user_id: 'test', plan: 'guardian', status: 'active', billing_cycle: 'monthly', started_at: '2026-10-01T00:00:00Z', renews_at: '2026-11-01T00:00:00Z', cancelled_at: null };
test('active and cancelled entitlements allow access before expiry', () => {
  assert.equal(evaluateEntitlement(row, now).canRunCheck, true);
  assert.equal(evaluateEntitlement({ ...row, status: 'cancelled' }, now).canRunCheck, true);
});
test('expiry boundary denies active and cancelled access', () => {
  for (const status of ['active', 'cancelled', 'trialing']) {
    assert.equal(evaluateEntitlement({ ...row, status, renews_at: new Date(now).toISOString() }, now).canRunCheck, false);
  }
});
test('missing, unknown, suspended and past-due entitlements deny access', () => {
  assert.equal(evaluateEntitlement(null, now).canRunCheck, false);
  for (const status of ['suspended', 'past_due', 'reactivated', 'invented']) assert.equal(evaluateEntitlement({ ...row, status }, now).canRunCheck, false);
  for (const plan of ['free', 'premium', 'constructor', 'invented']) assert.equal(evaluateEntitlement({ ...row, plan }, now).canRunCheck, false);
});
test('invalid/future dates never grant access', () => {
  for (const renews_at of [null, '', 'bad date']) assert.equal(evaluateEntitlement({ ...row, renews_at }, now).canRunCheck, false);
  assert.equal(evaluateEntitlement({ ...row, started_at: '2030-01-01' }, now).canRunCheck, false);
});
test('trial and cancelled trial retain 15 total checks and 5 daily', () => {
  for (const status of ['trialing', 'cancelled']) {
    const result = evaluateEntitlement({ ...row, plan: 'sentinel', billing_cycle: null, status }, now);
    assert.equal(result.limits.trialTotalChecks, 15);
    assert.equal(result.limits.dailyChecks, 5);
  }
});
test('plan quotas and shared input/burst guards match module contract', () => {
  for (const [plan, monthly, daily] of [['sentinel', 60, 5], ['guardian', 200, 15], ['aegis', 600, 40]]) {
    const result = evaluateEntitlement({ ...row, plan }, now);
    assert.equal(result.limits.monthlyChecks, monthly); assert.equal(result.limits.dailyChecks, daily);
    assert.equal(result.limits.inputCharacters, 2000); assert.equal(result.limits.checksPerMinute, 5);
  }
});
test('calendar billing clamps month-end and leap-year dates', () => {
  assert.equal(billingEnd(new Date('2026-01-31T12:30:00Z'), 1), '2026-02-28T12:30:00.000Z');
  assert.equal(billingEnd(new Date('2024-02-29T12:30:00Z'), 12), '2025-02-28T12:30:00.000Z');
  assert.equal(billingEnd(new Date('2026-10-18T12:30:00Z'), 3), '2027-01-18T12:30:00.000Z');
});
test('only approved plans/cycles accepted, prices in LKR', () => {
  assert.equal(plans.isPlan('toString'), false); assert.equal(plans.isCycle('weekly'), false);
  assert.equal(plans.PLANS.sentinel.price.quarterly, 1320);
  assert.equal(plans.PLANS.guardian.price.yearly, 9900);
  assert.equal(plans.PLANS.aegis.price.monthly, 1990);
});

function routeHarness(current = null, signedIn = true, readFailure = false, paymentKind = 'paid') {
  const writes = [];
  const payments = [];
  const readFilters = [];
  const read = { select() { return this; }, eq(column, value) { readFilters.push([column, value]); return this; }, async maybeSingle() { return { data: current, error: readFailure ? new Error('offline') : null }; } };
  const write = {
    insert(value) { writes.push({ operation: 'insert', value }); return this; },
    update(value) { writes.push({ operation: 'update', value }); return this; },
    eq() { return this; }, is() { return this; }, select() { return this; },
    async single() { return { data: { ...current, ...writes.at(-1).value }, error: null }; },
  };
  const server = load('src/lib/subscription-server.ts', {
    './entitlement': { evaluateEntitlement },
    '@supabase/supabase-js': {
      createClient: (_url, key) => key === 'writer' ? {
        from: () => write,
        async rpc(name, args) {
          payments.push({ name, args });
          if (paymentKind !== 'paid') return { data: { kind: paymentKind }, error: null };
          const start = new Date();
          const value = {
            user_id: args.p_user_id, plan: args.p_plan, status: 'active', billing_cycle: args.p_cycle,
            started_at: start.toISOString(), renews_at: billingEnd(start, { monthly: 1, quarterly: 3, yearly: 12 }[args.p_cycle]), cancelled_at: null,
          };
          writes.push({ operation: 'rpc', value });
          return { data: { kind: 'paid', subscription: value, transactionId: 'transaction-id' }, error: null };
        },
      } : {
        auth: { getUser: async token => token === 'valid-token'
          ? { data: { user: { id: 'server-user', created_at: new Date().toISOString() } }, error: null }
          : { data: { user: null }, error: new Error('invalid token') } },
        from: () => read,
      },
    },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'reader', SUPABASE_SERVICE_ROLE_KEY: 'writer' } } });
  const routes = load('src/app/api/subscription/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/subscription-server': server,
    '@/lib/plans': plans,
    '@/lib/payment-methods': paymentMethods,
    '@/lib/test-cards': testCards,
    'node:crypto': require('node:crypto'),
    '@/lib/entitlement': { evaluateEntitlement, billingEnd },
  });
  return { writes, payments, readFilters, request: (method, body) => routes[method]({
    method, headers: new Headers({ Authorization: signedIn ? 'Bearer valid-token' : 'Bearer invalid-token' }), json: async () => body,
  }) };
}
test('route rejects unauthenticated operations without writing', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const api = routeHarness(null, false);
    assert.equal((await api.request(method)).status, 401); assert.equal(api.writes.length, 0);
    assert.equal(api.readFilters.length, 0);
  }
});
test('entitlement lookup uses only the identity verified by Supabase', async () => {
  const api = routeHarness();
  const response = await api.request('GET', { user_id: 'another-user', canRunCheck: true });
  assert.deepEqual(api.readFilters, [['user_id', 'server-user']]);
  assert.equal(response.status, 200);
  assert.equal(response.body.entitlement.canRunCheck, false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
test('route read failure fails closed', async () => {
  const api = routeHarness(null, true, true);
  assert.equal((await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success' })).status, 503);
  assert.equal(api.writes.length, 0);
});
test('declined, invalid cycle and unapproved promo never write', async () => {
  for (const body of [
    { plan: 'guardian', billingCycle: 'monthly', scenario: 'declined' },
    { plan: 'guardian', billingCycle: 'weekly', scenario: 'success' },
    { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', promoCode: 'FORGED' },
  ]) {
    const api = routeHarness(); const response = await api.request('POST', body);
    assert.ok(response.status >= 400); assert.equal(api.writes.length, 0);
  }
});
test('checkout uses verified user and selected plan; forged identity/expiry ignored', async () => {
  const api = routeHarness();
  const response = await api.request('POST', { plan: 'aegis', billingCycle: 'quarterly', scenario: 'success', user_id: 'victim', renews_at: '2099-01-01', status: 'suspended' });
  assert.equal(response.status, 200);
  assert.equal(api.writes[0].value.user_id, 'server-user');
  assert.equal(api.writes[0].value.plan, 'aegis');
  assert.equal(api.writes[0].value.status, 'active');
  assert.notEqual(api.writes[0].value.renews_at, '2099-01-01');
});

test('both card methods create mock entitlements without storing payment details', async () => {
  for (const paymentMethod of ['debit_card', 'credit_card']) {
    const api = routeHarness();
    const response = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', paymentMethod });
    assert.equal(response.status, 200);
    assert.equal(response.body.paymentMethod, paymentMethod);
    assert.equal(response.body.mocked, true);
    assert.equal(api.writes.length, 1);
    assert.equal('paymentMethod' in api.writes[0].value, false);
  }
});
test('payment RPC uses verified identity and preserves the retry key without returning balances', async () => {
  const api = routeHarness();
  const requestId = '04cbe6cf-135c-4677-8fbe-4640904b3d89';
  const body = { plan: 'guardian', billingCycle: 'yearly', scenario: 'success', testCardId: '4444', requestId, user_id: 'victim', amount: 1, p_backfill: true };
  const result = await api.request('POST', body);
  assert.equal(result.status, 200);
  assert.equal(result.body.transactionId, 'transaction-id');
  assert.equal('balance' in result.body, false);
  assert.equal(api.payments[0].name, 'm2_pay_test_subscription');
  assert.equal(api.payments[0].args.p_user_id, 'server-user');
  assert.equal(api.payments[0].args.p_request_id, requestId);
  assert.equal(api.payments[0].args.p_card_id, '4444');
  assert.equal('p_backfill' in api.payments[0].args, false);
  assert.equal('amount' in api.payments[0].args, false);
  await api.request('POST', body);
  assert.equal(api.payments[1].args.p_request_id, requestId);
});
test('insufficient funds and payment conflicts do not report an active subscription', async () => {
  for (const [kind, status] of [['declined', 402], ['conflict', 409], ['blocked', 403], ['invalid', 400]]) {
    const api = routeHarness(null, true, false, kind);
    const result = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', testCardId: '0002' });
    assert.equal(result.status, status);
    assert.equal(result.body.subscription, undefined);
    assert.equal(api.writes.length, 0);
  }
});
test('invalid card IDs and retry keys never reach the payment RPC', async () => {
  for (const fields of [{ testCardId: 'forged' }, { requestId: '' }, { requestId: 'bad-uuid' }]) {
    const api = routeHarness();
    const result = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', ...fields });
    assert.equal(result.status, 400);
    assert.equal(api.payments.length, 0);
  }
});

test('invalid methods and declined card payments leave subscriptions unchanged', async () => {
  for (const paymentMethod of ['cash', 'constructor', null, {}, 'debit_card', 'credit_card']) {
    const api = routeHarness();
    const valid = paymentMethods.isPaymentMethod(paymentMethod);
    const response = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: valid ? 'declined' : 'success', paymentMethod });
    assert.equal(response.status, valid ? 402 : 400);
    assert.equal(api.writes.length, 0);
  }
});
test('blocked accounts cannot purchase or allocate a trial', async () => {
  for (const status of ['suspended', 'past_due']) for (const method of ['POST', 'PUT', 'DELETE']) {
    const api = routeHarness({ ...row, status });
    assert.equal((await api.request(method, { plan: 'aegis', billingCycle: 'monthly', scenario: 'success' })).status, 403);
    assert.equal(api.writes.length, 0);
  }
});
test('trial cannot be allocated twice', async () => {
  const api = routeHarness(row);
  assert.equal((await api.request('PUT')).status, 409); assert.equal(api.writes.length, 0);
});
test('trial is inserted once with a seven-day server-derived expiry', async () => {
  const api = routeHarness(); const response = await api.request('PUT');
  assert.equal(response.status, 200);
  const value = api.writes[0].value;
  assert.equal(value.status, 'trialing'); assert.equal(value.plan, 'sentinel');
  assert.equal(Date.parse(value.renews_at) - Date.parse(value.started_at), 7 * 86400000);
});
test('cancellation preserves existing plan/expiry and repeated cancellation is idempotent', async () => {
  const api = routeHarness(row);
  const response = await api.request('DELETE');
  assert.equal(response.body.subscription.plan, row.plan);
  assert.equal(response.body.subscription.renews_at, row.renews_at);
  assert.equal(response.body.subscription.status, 'cancelled');
  const repeat = routeHarness(response.body.subscription);
  assert.equal((await repeat.request('DELETE')).status, 200); assert.equal(repeat.writes.length, 0);
});

function frontendDemo() {
  const storage = new Map();
  const window = new EventTarget();
  window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const testCards = load('src/lib/test-cards.ts');
  const demo = load('src/lib/demo-store.ts', { './plans': plans, './entitlement': { evaluateEntitlement, billingEnd }, './test-cards': testCards }, {
    window, Event,
  });
  return { demo, storage };
}
test('checkout return paths preserve the plan and cycle and reject untrusted redirects', () => {
  const { authPath, checkoutReturnPath } = load('src/lib/checkout-path.ts', { './plans': plans }, { URLSearchParams });
  const checkout = '/checkout?plan=guardian&cycle=yearly';
  assert.equal(checkoutReturnPath(new URLSearchParams(authPath('login', checkout).split('?')[1]).get('next')), checkout);
  for (const next of ['https://example.com/checkout?plan=guardian&cycle=yearly', '//example.com', '/account/subscription', '/checkout?plan=unknown&cycle=monthly', '/checkout?plan=guardian']) {
    assert.equal(checkoutReturnPath(next), null);
  }
});
test('frontend demo requires sign-in and preserves the sample plan for the demo account', () => {
  const { demo } = frontendDemo();
  assert.equal(demo.readDemo().user.signedIn, false);
  assert.throws(() => demo.demoSubscriptionRequest('POST', { plan: 'guardian', billingCycle: 'yearly', scenario: 'success' }), /log in/);
  demo.demoSignIn('demo@scamshield.test');
  assert.equal(demo.demoSubscriptionRequest('GET').subscription.plan, 'guardian');
});
test('demo auth listeners see the saved login and logout state immediately', () => {
  const { demo } = frontendDemo();
  const states = [];
  const unsubscribe = demo.subscribeToDemoAuth(() => states.push(demo.readDemo().user.signedIn));
  demo.demoSignIn('demo@scamshield.test');
  demo.demoSignOut();
  unsubscribe();
  demo.demoSignIn('demo@scamshield.test');
  assert.deepEqual(states, [true, false]);
});
test('legacy demo data requires login again and keeps the saved card and plan', () => {
  const { demo, storage } = frontendDemo();
  const key = 'scamshield-interim-demo-v1';
  const state = demo.readDemo();
  const card = { last4: '4242', expiry: '12/30' };
  storage.set(key, JSON.stringify({ ...state, version: 1, user: { ...state.user, signedIn: true }, card }));
  assert.equal(demo.readDemo().user.signedIn, false);
  assert.equal(demo.readDemo().card.last4, card.last4);
  assert.equal(demo.readDemo().subscription.plan, 'guardian');
  demo.demoSignIn('demo@scamshield.test');
  assert.equal(demo.readDemo().user.signedIn, true);
});
test('frontend demo signup starts with no plan and can start a trial', () => {
  const { demo } = frontendDemo();
  demo.demoSignIn('student@example.test', true);
  assert.equal(demo.readDemo().subscription, null);
  assert.equal(demo.readDemo().user.email, 'student@example.test');
  demo.demoSubscriptionRequest('PUT');
  assert.equal(demo.readDemo().subscription.status, 'trialing');
  assert.throws(() => demo.demoSubscriptionRequest('PUT'), /already/);
});
test('frontend demo checkout, upgrade and cancellation work without backend calls', () => {
  const { demo } = frontendDemo();
  demo.demoSignIn('demo@scamshield.test');
  demo.demoSubscriptionRequest('POST', { plan: 'aegis', billingCycle: 'yearly', scenario: 'success', promoCode: 'DEMO10' });
  const paid = demo.readDemo().subscription;
  assert.equal(paid.plan, 'aegis'); assert.equal(paid.billing_cycle, 'yearly');
  demo.demoSubscriptionRequest('DELETE');
  assert.equal(demo.readDemo().subscription.renews_at, paid.renews_at);
  assert.equal(demo.demoSubscriptionRequest('GET').entitlement.canRunCheck, true);
  demo.demoSubscriptionRequest('POST', { plan: 'sentinel', billingCycle: 'monthly', scenario: 'success' });
  assert.equal(demo.readDemo().subscription.plan, 'sentinel');
});
test('demo checkout debits only the selected test card and preserves balances on decline', () => {
  const { demo, storage } = frontendDemo();
  demo.demoSignIn('demo@scamshield.test');
  const initial = demo.readDemo();
  delete initial.cardBalances;
  storage.set('scamshield-interim-demo-v1', JSON.stringify(initial));
  assert.equal(demo.readDemo().cardBalances['4242'], 20_000_000);
  const payment = { plan: 'guardian', billingCycle: 'yearly', promoCode: 'DEMO10', testCardId: '4444' };
  assert.throws(() => demo.demoSubscriptionRequest('POST', { ...payment, scenario: 'declined' }), /declined/);
  assert.equal(demo.readDemo().cardBalances['4444'], 20_000_000);
  demo.demoSubscriptionRequest('POST', { ...payment, scenario: 'success' });
  assert.equal(demo.readDemo().cardBalances['4444'], 19_991_090);
  assert.equal(demo.readDemo().cardBalances['4242'], 20_000_000);
  const existing = demo.readDemo();
  delete existing.cardBalances['0002'];
  storage.set('scamshield-interim-demo-v1', JSON.stringify(existing));
  assert.equal(demo.readDemo().cardBalances['0002'], 400);
  const before = JSON.stringify(demo.readDemo());
  assert.throws(() => demo.demoSubscriptionRequest('POST', { ...payment, scenario: 'success', testCardId: '0002' }), /insufficient balance/);
  assert.equal(JSON.stringify(demo.readDemo()), before);
});
test('frontend declined payments and invalid promos preserve the previous plan', () => {
  const { demo } = frontendDemo();
  demo.demoSignIn('demo@scamshield.test');
  const previous = JSON.stringify(demo.readDemo());
  assert.throws(() => demo.demoSubscriptionRequest('POST', { plan: 'aegis', billingCycle: 'monthly', scenario: 'declined' }), /declined/);
  assert.throws(() => demo.demoSubscriptionRequest('POST', { plan: 'aegis', billingCycle: 'monthly', scenario: 'success', promoCode: 'INVALID' }), /DEMO10/);
  assert.equal(JSON.stringify(demo.readDemo()), previous);
});
test('frontend demo scenarios and logout are repeatable', () => {
  const { demo } = frontendDemo();
  demo.resetDemo('active'); assert.throws(() => demo.demoSubscriptionRequest('GET'), /log in/);
  demo.demoSignIn('demo@scamshield.test');
  demo.resetDemo('expired'); assert.equal(demo.demoSubscriptionRequest('GET').entitlement.canRunCheck, false);
  demo.resetDemo('trial'); assert.equal(demo.demoSubscriptionRequest('GET').entitlement.limits.trialTotalChecks, 15);
  demo.demoSignOut(); assert.throws(() => demo.demoSubscriptionRequest('GET'), /log in/);
  demo.demoSignIn('demo@scamshield.test'); assert.equal(demo.demoSubscriptionRequest('GET').entitlement.canRunCheck, true);
});
test('frontend saved card stores only dummy display metadata and can be removed', () => {
  const { demo, storage } = frontendDemo();
  demo.saveDemoCard({ last4: '4242', expiry: '12/30' });
  assert.equal(demo.readDemo().card.last4, '4242');
  const raw = [...storage.values()].join();
  assert.equal(raw.includes('4242424242424242'), false);
  assert.equal(raw.includes('password'), false);
  assert.equal(raw.includes('securityCode'), false);
  demo.saveDemoCard(null); assert.equal(demo.readDemo().card, null);
});

function backendClient({ session = { access_token: 'verified-token' }, responseOK = true } = {}) {
  const requests = [];
  const client = load('src/lib/subscription-client.ts', {
    './m2-mode': { DEMO_MODE: false },
    './demo-store': { demoSubscriptionRequest() { throw new Error('Demo storage must not be used'); } },
    './supabase': { getSupabase: () => ({ auth: { getSession: async () => ({ data: { session }, error: null }) } }) },
  }, { fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: responseOK, json: async () => responseOK ? { subscription: row, mocked: true } : { error: 'Server denied this operation' } };
  } });
  return { client, requests };
}
test('backend client requires an auth session and never falls back to dummy data', async () => {
  const { client, requests } = backendClient({ session: null });
  await assert.rejects(client.subscriptionRequest(), /Log in/);
  assert.equal(requests.length, 0);
});
test('backend client sends access token and checkout selection to the server without caching', async () => {
  const { client, requests } = backendClient();
  await client.subscriptionRequest('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success' });
  assert.equal(requests[0].url, '/api/subscription');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer verified-token');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(JSON.parse(requests[0].options.body).plan, 'guardian');
});
test('backend client surfaces rejection without a local success or entitlement', async () => {
  const { client } = backendClient({ responseOK: false });
  await assert.rejects(client.subscriptionRequest('DELETE'), /Server denied/);
});
