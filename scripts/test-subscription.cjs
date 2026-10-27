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

function routeHarness(current = null, signedIn = true, readFailure = false) {
  const writes = [];
  const read = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: current, error: readFailure ? new Error('offline') : null }; } };
  const write = {
    insert(value) { writes.push({ operation: 'insert', value }); return this; },
    update(value) { writes.push({ operation: 'update', value }); return this; },
    eq() { return this; }, is() { return this; }, select() { return this; },
    async single() { return { data: { ...current, ...writes.at(-1).value }, error: null }; },
  };
  const routes = load('src/app/api/subscription/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/subscription-server': {
      verifiedUser: async () => signedIn ? { user: { id: 'server-user', created_at: new Date().toISOString() }, db: { from: () => read } } : null,
      subscriptionWriter: () => ({ from: () => write }),
    },
    '@/lib/plans': plans,
    '@/lib/payment-methods': paymentMethods,
    '@/lib/entitlement': { evaluateEntitlement, billingEnd },
  });
  return { writes, request: (method, body) => routes[method]({ method, json: async () => body }) };
}
test('route rejects unauthenticated operations without writing', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const api = routeHarness(null, false);
    assert.equal((await api.request(method)).status, 401); assert.equal(api.writes.length, 0);
  }
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
  const demo = load('src/lib/demo-store.ts', { './plans': plans, './entitlement': { evaluateEntitlement, billingEnd } }, {
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
