/**
 * M4 — request-level entitlement gate tests (20 November 2026).
 *
 * Pins the D3 owner decision: no Authorization header → the labelled demo subject; a header
 * that verifies → the caller's real subject; anything else with a header fails closed and is
 * never silently downgraded to demo. Fixtures are M2's recorded samples (fields M4 needs),
 * same set the adapter tests use, plus the fixed M2 clock.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateRequestAccess, type RequestEntitlementGate } from './request-entitlement.ts';
import type { M2SubscriptionDecision } from './m2-entitlement-adapter.ts';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');

const FIXTURES: Record<string, M2SubscriptionDecision> = {
  trial: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000001' },
    entitlement: {
      canRunCheck: true, reason: 'valid_entitlement', planId: 'sentinel', status: 'trialing',
      expiresAt: '2026-11-21T09:00:00.000Z', limits: null,
    },
  },
  paid: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000002' },
    entitlement: {
      canRunCheck: true, reason: 'valid_entitlement', planId: 'guardian', status: 'active',
      expiresAt: '2026-12-01T09:00:00.000Z', limits: null,
    },
  },
  noSubscription: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000004' },
    entitlement: { canRunCheck: false, reason: 'subscription_required', planId: null, status: null, expiresAt: null, limits: null },
  },
  expired: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000003' },
    entitlement: {
      canRunCheck: false, reason: 'subscription_required', planId: 'guardian', status: 'active',
      expiresAt: '2026-11-15T12:00:00.000Z', limits: null,
    },
  },
  unauthenticated: { kind: 'unauthenticated' },
  unavailable: { kind: 'unavailable' },
};

function gate(decision: M2SubscriptionDecision | null | undefined, hasAuthorization: boolean, now = NOW): RequestEntitlementGate {
  return gateRequestAccess(decision, hasAuthorization, now);
}

test('no Authorization header always takes the labelled demo path', () => {
  for (const decision of [undefined, null, FIXTURES.trial, FIXTURES.noSubscription, FIXTURES.unavailable, { kind: 'garbage' }]) {
    assert.deepEqual(gate(decision, false), { kind: 'demo' }, JSON.stringify(decision));
  }
});

test('a verified caller with entitlement runs under their own subject key', () => {
  assert.deepEqual(gate(FIXTURES.trial, true), { kind: 'allowed', subjectKey: '00000000-0000-4000-8000-000000000001' });
  assert.deepEqual(gate(FIXTURES.paid, true), { kind: 'allowed', subjectKey: '00000000-0000-4000-8000-000000000002' });
});

test('a caller claiming identity is never silently downgraded to demo', () => {
  assert.deepEqual(gate(FIXTURES.unauthenticated, true), { kind: 'rejected', status: 401, error: 'Sign in required.' });
  assert.deepEqual(gate(null, true), { kind: 'rejected', status: 503, error: 'Access check temporarily unavailable.' });
  assert.deepEqual(gate({ kind: 'garbage' }, true), { kind: 'rejected', status: 503, error: 'Access check temporarily unavailable.' });
});

test('denials and unavailable decisions map to their honest statuses', () => {
  const denied = gate(FIXTURES.noSubscription, true);
  assert.equal(denied.kind, 'rejected');
  if (denied.kind === 'rejected') assert.equal(denied.status, 403);
  const expired = gate(FIXTURES.expired, NOW + 1, true);
  assert.equal(expired.kind, 'rejected');
  if (expired.kind === 'rejected') assert.equal(expired.status, 403);
  const unavailable = gate(FIXTURES.unavailable, true);
  assert.equal(unavailable.kind, 'rejected');
  if (unavailable.kind === 'rejected') assert.equal(unavailable.status, 503);
});

test('the subject comes only from the server-fetched decision, never from request fields', () => {
  // The route passes M2's getSubscriptionContext result; the browser cannot construct this
  // object. The adapter's documented older-fixture fallback (decision.subjectKey) still maps:
  const legacy: M2SubscriptionDecision = { kind: 'verified', subjectKey: 'legacy-fixture-subject', entitlement: { canRunCheck: true, planId: 'guardian', status: 'active', expiresAt: '2026-12-01T09:00:00.000Z' } };
  assert.deepEqual(gate(legacy, true), { kind: 'allowed', subjectKey: 'legacy-fixture-subject' });
  // Without a verified decision there is no subject to hand out at all:
  assert.deepEqual(gate({ kind: 'verified', entitlement: { canRunCheck: true, planId: 'guardian', status: 'active', expiresAt: '2026-12-01T09:00:00.000Z' } }, true),
    { kind: 'rejected', status: 503, error: 'Access decision could not be verified.' });
});
