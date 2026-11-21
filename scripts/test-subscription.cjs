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

function routeHarness(current = null, signedIn = true, readFailure = false, failures = {}) {
  const writes = [];
  const readFilters = [];
  const read = { select() { return this; }, eq(column, value) { readFilters.push([column, value]); return this; }, async maybeSingle() { return { data: current, error: readFailure ? new Error('offline') : null }; } };
  let subscriptionAttempts = 0;
  // Table-aware writer, so the ledger can fail on its own and the first subscriptions write can
  // report the billing columns as missing (exercising the route's degradation path).
  const writerFor = table => ({
    insert(value) { writes.push({ table, operation: 'insert', value }); return this; },
    update(value) { writes.push({ table, operation: 'update', value }); return this; },
    eq() { return this; }, is() { return this; }, select() { return this; },
    async single() {
      if (table === 'subscriptions') {
        subscriptionAttempts += 1;
        if (subscriptionAttempts === 1) {
          if (failures.missingBillingColumns) return { data: null, error: { code: '42703', message: 'column "price_lkr" of relation "subscriptions" does not exist' } };
          if (failures.subscriptionFailure) return { data: null, error: failures.subscriptionFailure };
        }
      }
      return { data: { ...current, ...writes.at(-1).value }, error: null };
    },
    // The ledger insert is awaited directly, so the builder is thenable like a real query. It must
    // resolve to a plain object: resolving with `this` would re-enter `then` forever.
    then(resolve) {
      if (table === 'subscription_payments' && failures.ledgerFailure) {
        return resolve({ data: null, error: { code: '42P01', message: 'relation "public.subscription_payments" does not exist' } });
      }
      return resolve({ data: null, error: null });
    },
  });
  const server = load('src/lib/subscription-server.ts', {
    './entitlement': { evaluateEntitlement },
    '@supabase/supabase-js': {
      createClient: (_url, key) => key === 'writer' ? { from: table => writerFor(table) } : {
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
    '@/lib/entitlement': { evaluateEntitlement, billingEnd },
  });
  return { writes, readFilters, request: (method, body) => routes[method]({
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

test('checkout records the price and a simulated charge without storing card details', async () => {
  for (const paymentMethod of ['debit_card', 'credit_card']) {
    const api = routeHarness();
    const response = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', paymentMethod });
    assert.equal(response.status, 200);
    assert.equal(response.body.paymentMethod, paymentMethod);
    assert.equal(response.body.priceLkr, 990);
    assert.equal(response.body.mocked, true);
    assert.equal(response.body.billingRecorded, true);
    // 1) subscription row, 2) payment-history row
    assert.equal(api.writes.length, 2);
    const subscription = api.writes[0].value;
    assert.equal('paymentMethod' in subscription, false);
    assert.equal(subscription.payment_method, paymentMethod);
    assert.equal(subscription.price_lkr, 990);
    assert.equal(subscription.currency, 'LKR');
    assert.equal(subscription.auto_renew, false);
    const charge = api.writes[1].value;
    assert.equal(charge.amount_lkr, 990);
    assert.equal(charge.simulated, true);
    assert.equal(charge.period_start, subscription.started_at);
    assert.equal(charge.period_end, subscription.renews_at);
    for (const key of ['card_number', 'cardNumber', 'expiry', 'cvv', 'security_code', 'securityCode'])
      for (const write of api.writes) assert.equal(key in write.value, false);
  }
});

test('a ledger failure still grants access and reports paymentRecorded false', async () => {
  const api = routeHarness(null, true, false, { ledgerFailure: true });
  const response = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', paymentMethod: 'credit_card' });
  assert.equal(response.status, 200, 'the ledger must never be able to grant or revoke access');
  assert.equal(response.body.paymentRecorded, false);
  assert.equal(response.body.billingRecorded, true);
  assert.equal(response.body.subscription.status, 'active');
  assert.equal(response.body.subscription.plan, 'guardian');
  assert.equal(api.writes.filter(write => write.table === 'subscriptions').length, 1);
  for (const key of ['card_number', 'cardNumber', 'expiry', 'cvv', 'security_code', 'securityCode'])
    for (const write of api.writes) assert.equal(key in write.value, false);
});

test('checkout still succeeds when the billing draft has not been applied', async () => {
  const api = routeHarness(null, true, false, { missingBillingColumns: true });
  const response = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success', paymentMethod: 'debit_card' });
  assert.equal(response.status, 200, 'a missing migration must not 409 the checkout');
  assert.equal(response.body.billingRecorded, false);
  assert.equal(response.body.paymentRecorded, true);
  assert.equal(response.body.subscription.status, 'active');
  const subscriptionWrites = api.writes.filter(write => write.table === 'subscriptions');
  assert.equal(subscriptionWrites.length, 2, 'one attempt with the billing columns, one without');
  assert.equal(subscriptionWrites[0].value.price_lkr, 990);
  assert.equal('price_lkr' in subscriptionWrites[1].value, false);
  assert.equal('payment_method' in subscriptionWrites[1].value, false);
  assert.equal(subscriptionWrites[1].value.billing_cycle, 'monthly', 'access itself is unaffected');
});

test('a genuine subscription write failure still returns 409 and records no charge', async () => {
  const api = routeHarness(null, true, false, { subscriptionFailure: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
  const response = await api.request('POST', { plan: 'guardian', billingCycle: 'monthly', scenario: 'success' });
  assert.equal(response.status, 409, 'only a missing schema degrades; a real conflict still fails');
  assert.equal(api.writes.filter(write => write.table === 'subscriptions').length, 1, 'a conflict is not retried');
  assert.equal(api.writes.filter(write => write.table === 'subscription_payments').length, 0);
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
  const testCards = load('src/lib/test-cards.ts');
  const demo = load('src/lib/demo-store.ts', { './plans': plans, './entitlement': { evaluateEntitlement, billingEnd }, './test-cards': testCards }, {
    window: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
  });
  return { demo, storage };
}
test('frontend demo seeds an active sample account and persists changes', () => {
  const { demo } = frontendDemo();
  assert.equal(demo.readDemo().subscription.plan, 'guardian');
  demo.demoSignIn('student@example.test', true);
  assert.equal(demo.readDemo().subscription, null);
  assert.equal(demo.readDemo().user.email, 'student@example.test');
  demo.demoSubscriptionRequest('PUT');
  assert.equal(demo.readDemo().subscription.status, 'trialing');
  assert.throws(() => demo.demoSubscriptionRequest('PUT'), /already/);
});
test('frontend demo checkout, upgrade and cancellation work without backend calls', () => {
  const { demo } = frontendDemo();
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
  const previous = JSON.stringify(demo.readDemo());
  assert.throws(() => demo.demoSubscriptionRequest('POST', { plan: 'aegis', billingCycle: 'monthly', scenario: 'declined' }), /declined/);
  assert.throws(() => demo.demoSubscriptionRequest('POST', { plan: 'aegis', billingCycle: 'monthly', scenario: 'success', promoCode: 'INVALID' }), /DEMO10/);
  assert.equal(JSON.stringify(demo.readDemo()), previous);
});
test('frontend demo scenarios and logout are repeatable', () => {
  const { demo } = frontendDemo();
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
