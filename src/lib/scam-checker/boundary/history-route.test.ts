import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryRoute } from './history-route.ts';
import type { M2SubscriptionDecision } from './m2-entitlement-adapter.ts';
import type { StoredHistoryEntry } from './persistence-port.ts';

const NOW = Date.parse('2026-11-24T00:00:00.000Z');
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';
const SUBJECT = '11111111-1111-4111-8111-111111111111';

const ENTRY: StoredHistoryEntry = {
  id: 'history-1', checkId: 'chk-1', subjectKey: SUBJECT, planId: 'sentinel',
  createdAt: NOW - 1000, expiresAt: NOW + 86_400_000, snippet: 'Verify your password',
  verdictLabel: 'suspicious', category: 'phishing',
};

function verified(over: Record<string, unknown> = {}): M2SubscriptionDecision {
  return {
    kind: 'verified', user: { id: SUBJECT },
    entitlement: { canRunCheck: true, reason: 'valid_entitlement', planId: 'sentinel', status: 'active', expiresAt: FUTURE, ...over },
  };
}

/** A reader double that records the subject it was asked for and returns canned own rows. */
function reader(rows: StoredHistoryEntry[] = [ENTRY]) {
  const asked: string[] = [];
  return {
    asked,
    listOwned: async (subjectKey: string): Promise<StoredHistoryEntry[]> => { asked.push(subjectKey); return rows; },
  };
}

function route(decision: M2SubscriptionDecision | null | undefined, rows?: StoredHistoryEntry[]) {
  const r = reader(rows);
  const handle = createHistoryRoute({ resolveDecision: () => decision, listOwned: r.listOwned, now: () => NOW });
  return { handle, asked: r.asked };
}

test('GET returns full access and own rows for an active caller, using the verified subject', async () => {
  const { handle, asked } = route(verified());
  const response = await handle({ method: 'GET', session: {} });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const body = response.body as { access: string; entries: StoredHistoryEntry[] };
  assert.equal(body.access, 'full');
  assert.deepEqual(body.entries, [ENTRY]);
  assert.deepEqual(asked, [SUBJECT], 'the store is asked for the verified id, never a browser value');
});

test('an expired caller is read-only, not denied', async () => {
  const { handle } = route(verified({ expiresAt: PAST }));
  const response = await handle({ method: 'GET', session: {} });
  assert.equal(response.status, 200);
  assert.equal((response.body as { access: string }).access, 'read-only');
});

test('non-GET methods are refused with 405 and an Allow header', async () => {
  const { handle, asked } = route(verified());
  const response = await handle({ method: 'POST', session: {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET');
  assert.deepEqual(asked, [], 'a refused method never reads the store');
});

test('unauthenticated, unavailable and throwing resolvers fail closed', async () => {
  assert.equal((await route({ kind: 'unauthenticated' }).handle({ method: 'GET', session: {} })).status, 401);
  assert.equal((await route({ kind: 'unavailable' }).handle({ method: 'GET', session: {} })).status, 503);
  assert.equal((await route(null).handle({ method: 'GET', session: {} })).status, 503);
  const throwing = createHistoryRoute({ resolveDecision: () => { throw new Error('down'); }, listOwned: reader().listOwned, now: () => NOW });
  assert.equal((await throwing({ method: 'GET', session: {} })).status, 503);
});

test('a verified caller with no readable entitlement is refused with 403', async () => {
  const { handle, asked } = route(verified({ canRunCheck: false, reason: 'subscription_required', planId: null, status: null, expiresAt: null }));
  const response = await handle({ method: 'GET', session: {} });
  assert.equal(response.status, 403);
  assert.deepEqual(asked, []);
});

test('a store failure is a 503, never a fabricated empty success', async () => {
  const handle = createHistoryRoute({
    resolveDecision: () => verified(),
    listOwned: async () => { throw new Error('store down'); },
    now: () => NOW,
  });
  assert.equal((await handle({ method: 'GET', session: {} })).status, 503);
});

test('an empty history is an honest 200 with no entries', async () => {
  const { handle } = route(verified(), []);
  const response = await handle({ method: 'GET', session: {} });
  assert.equal(response.status, 200);
  assert.deepEqual((response.body as { entries: unknown[] }).entries, []);
});