import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHistoryRead } from './history-read.ts';
import type { M2SubscriptionDecision } from './m2-entitlement-adapter.ts';

const NOW = Date.parse('2026-11-24T00:00:00.000Z');
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';
const SUBJECT = '11111111-1111-4111-8111-111111111111';

function verified(over: Record<string, unknown> = {}): M2SubscriptionDecision {
  return {
    kind: 'verified',
    user: { id: SUBJECT },
    entitlement: { canRunCheck: true, reason: 'valid_entitlement', planId: 'sentinel', status: 'active', expiresAt: FUTURE, ...over },
  };
}

test('an active, trial or cancelled-before-expiry caller reads full history', () => {
  for (const status of ['active', 'trial', 'trialing', 'cancelled']) {
    const admission = resolveHistoryRead(verified({ status }), NOW);
    assert.equal(admission.status, 200);
    assert.equal(admission.status === 200 && admission.access, 'full');
    assert.equal(admission.status === 200 && admission.subjectKey, SUBJECT);
  }
});

test('an expired caller keeps read-only access to retained history, not a denial', () => {
  const admission = resolveHistoryRead(verified({ expiresAt: PAST }), NOW);
  assert.equal(admission.status, 200);
  assert.equal(admission.status === 200 && admission.access, 'read-only');
});

test('suspended, past_due and cancelled-after-expiry callers are read-only', () => {
  for (const over of [{ status: 'suspended' }, { status: 'past_due' }, { status: 'cancelled', expiresAt: PAST }]) {
    const admission = resolveHistoryRead(verified(over), NOW);
    assert.equal(admission.status, 200);
    assert.equal(admission.status === 200 && admission.access, 'read-only');
  }
});

test('canRunCheck does not govern reads: a denied-but-expired caller still reads read-only', () => {
  const admission = resolveHistoryRead(verified({ canRunCheck: false, reason: 'subscription_required', expiresAt: PAST }), NOW);
  assert.equal(admission.status, 200);
  assert.equal(admission.status === 200 && admission.access, 'read-only');
});

test('a verified caller with no mappable entitlement is refused with 403', () => {
  const admission = resolveHistoryRead(verified({ canRunCheck: false, reason: 'subscription_required', planId: null, status: null, expiresAt: null }), NOW);
  assert.deepEqual(admission, { status: 403, error: 'access-blocked' });
});

test('unauthenticated and unavailable decisions fail closed', () => {
  assert.deepEqual(resolveHistoryRead({ kind: 'unauthenticated' }, NOW), { status: 401, error: 'sign-in-required' });
  assert.deepEqual(resolveHistoryRead({ kind: 'unavailable' }, NOW), { status: 503, error: 'access-unavailable' });
  assert.deepEqual(resolveHistoryRead(null, NOW), { status: 503, error: 'access-unavailable' });
  assert.deepEqual(resolveHistoryRead(undefined, NOW), { status: 503, error: 'access-unavailable' });
});

test('a verified but unmappable status with canRunCheck true is unavailable, never an allow', () => {
  const admission = resolveHistoryRead(verified({ status: 'not-a-real-status' }), NOW);
  assert.deepEqual(admission, { status: 503, error: 'access-unavailable' });
});

test('the subject is always the verified id, never browser-supplied', () => {
  const admission = resolveHistoryRead(verified(), NOW);
  assert.equal(admission.status === 200 && admission.subjectKey, SUBJECT);
});