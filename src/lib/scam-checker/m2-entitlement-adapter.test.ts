/**
 * M4 — M2 entitlement adapter tests (15 November 2026).
 *
 * Contract: contracts/M4-M2-entitlement-session-handoff-20261115.md — M2's second handoff fixed
 * the result shape (`kind`, nested `entitlement`, ISO `expiresAt`, `user.id`) and the adapter
 * fixtures below are copied from M2's own sample results (fixed clock 2026-11-15T12:00:00Z).
 *
 * Runner: Node's built-in test runner (`node --test`), zero dependencies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createM2EntitlementPort, mapM2Status, parseM2Expiry, resolveM2Outcome, toEntitlementSnapshot,
  type M2SubscriptionDecision,
} from './m2-entitlement-adapter.ts';

/** M2's fixed test clock: 2026-11-15T12:00:00.000Z. */
const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const DAY = 86_400_000;

/** M2 sample results, copied verbatim (fields M4 needs). */
const FIXTURES = {
  trial: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000001' },
    entitlement: {
      canRunCheck: true, reason: 'valid_entitlement', planId: 'sentinel', status: 'trialing',
      expiresAt: '2026-11-21T09:00:00.000Z',
      limits: { monthlyChecks: 15, dailyChecks: 5, trialTotalChecks: 15, inputCharacters: 2000, checksPerMinute: 5 },
    },
  },
  paid: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000002' },
    entitlement: {
      canRunCheck: true, reason: 'valid_entitlement', planId: 'guardian', status: 'active',
      expiresAt: '2026-12-01T09:00:00.000Z',
      limits: { monthlyChecks: 200, dailyChecks: 15, trialTotalChecks: null, inputCharacters: 2000, checksPerMinute: 5 },
    },
  },
  expired: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000003' },
    entitlement: {
      canRunCheck: false, reason: 'subscription_required', planId: 'guardian', status: 'active',
      expiresAt: '2026-11-15T12:00:00.000Z', limits: null,
    },
  },
  noSubscription: {
    kind: 'verified',
    user: { id: '00000000-0000-4000-8000-000000000004' },
    subscription: null,
    entitlement: {
      canRunCheck: false, reason: 'subscription_required', planId: null, status: null,
      expiresAt: null, limits: null,
    },
  },
  unauthenticated: { kind: 'unauthenticated' },
  unavailable: { kind: 'unavailable' },
} as const;

test('M2 trial sample: trialing → trial, sentinel plan, ISO expiry parsed, allowed', () => {
  const outcome = resolveM2Outcome(FIXTURES.trial as M2SubscriptionDecision, NOW);
  assert.equal(outcome.kind, 'allowed');
  assert.deepEqual(outcome.snapshot, {
    subjectKey: '00000000-0000-4000-8000-000000000001',
    planId: 'sentinel',
    status: 'trial',
    expiresAt: Date.parse('2026-11-21T09:00:00.000Z'),
  });
});

test('M2 paid sample: active guardian allowed with parsed epoch-ms expiry', () => {
  const outcome = resolveM2Outcome(FIXTURES.paid as M2SubscriptionDecision, NOW);
  assert.equal(outcome.kind, 'allowed');
  assert.deepEqual(outcome.snapshot, {
    subjectKey: '00000000-0000-4000-8000-000000000002',
    planId: 'guardian',
    status: 'active',
    expiresAt: Date.parse('2026-12-01T09:00:00.000Z'),
  });
});

test('M2 expired sample: canRunCheck false → denied (not unavailable), snapshot may map', () => {
  const outcome = resolveM2Outcome(FIXTURES.expired as M2SubscriptionDecision, NOW);
  assert.equal(outcome.kind, 'denied');
  assert.ok(outcome.snapshot); // expiry parses; M2's gate is what denies at the boundary instant
});

test('M2 noSubscription sample: verified user with a denied decision → denied, no snapshot', () => {
  const outcome = resolveM2Outcome(FIXTURES.noSubscription as M2SubscriptionDecision, NOW);
  assert.equal(outcome.kind, 'denied');
  assert.equal(outcome.snapshot, null);
});

test('M2 helper states map to 401 / 503', () => {
  assert.equal(resolveM2Outcome(FIXTURES.unauthenticated as M2SubscriptionDecision, NOW).kind, 'unauthenticated');
  assert.equal(resolveM2Outcome(FIXTURES.unavailable as M2SubscriptionDecision, NOW).kind, 'unavailable');
  assert.equal(resolveM2Outcome({} as M2SubscriptionDecision, NOW).kind, 'unavailable');
  assert.equal(resolveM2Outcome(null, NOW).kind, 'unavailable');
  assert.equal(resolveM2Outcome(undefined, NOW).kind, 'unavailable');
});

test('the exact expiry instant is denied, and an expired row with status active/cancelled still denies', () => {
  const atBoundary = {
    kind: 'verified', user: { id: 'u' },
    entitlement: { canRunCheck: true, planId: 'guardian', status: 'active', expiresAt: new Date(NOW).toISOString() },
  } as M2SubscriptionDecision;
  assert.equal(resolveM2Outcome(atBoundary, NOW).kind, 'denied');
  const cancelledExpired = {
    kind: 'verified', user: { id: 'u' },
    entitlement: { canRunCheck: true, planId: 'guardian', status: 'cancelled', expiresAt: new Date(NOW - 1).toISOString() },
  } as M2SubscriptionDecision;
  assert.equal(resolveM2Outcome(cancelledExpired, NOW).kind, 'denied');
});

test('a cancelled trial retains access strictly until expiry (M2: cancelled status)', () => {
  const cancelled = {
    kind: 'verified', user: { id: 'u' },
    entitlement: { canRunCheck: true, planId: 'sentinel', status: 'cancelled', expiresAt: new Date(NOW + DAY).toISOString() },
  } as M2SubscriptionDecision;
  const outcome = resolveM2Outcome(cancelled, NOW);
  assert.equal(outcome.kind, 'allowed');
  assert.equal(outcome.snapshot?.status, 'cancelled');
});

test('null, invalid or elapsed expiry and unknown status fail closed (never an allow)', () => {
  for (const entitlement of [
    { canRunCheck: true, planId: 'guardian', status: 'active', expiresAt: null },
    { canRunCheck: true, planId: 'guardian', status: 'active', expiresAt: 'not-a-date' },
    { canRunCheck: true, planId: 'guardian', status: 'weird', expiresAt: new Date(NOW + DAY).toISOString() },
    { canRunCheck: true, planId: null, status: 'active', expiresAt: new Date(NOW + DAY).toISOString() },
  ]) {
    const outcome = resolveM2Outcome({ kind: 'verified', user: { id: 'u' }, entitlement } as M2SubscriptionDecision, NOW);
    assert.equal(outcome.kind, 'unavailable', JSON.stringify(entitlement));
    assert.equal(outcome.snapshot, null);
  }
});

test('flat legacy fixtures still map (kind + top-level fields)', () => {
  const flat = {
    result: 'verified', canRunCheck: true, planId: 'guardian', status: 'active',
    expiresAt: NOW + DAY, user: { id: 'u-flat' },
  } as M2SubscriptionDecision;
  const outcome = resolveM2Outcome(flat, NOW);
  assert.equal(outcome.kind, 'allowed');
  assert.equal(outcome.snapshot?.subjectKey, 'u-flat');
  assert.equal(outcome.snapshot?.status, 'active');
});

test('mapping helpers: trialing, ISO parsing and epoch-ms conversion', () => {
  assert.equal(mapM2Status('trialing'), 'trial');
  assert.equal(mapM2Status('past_due'), 'past_due');
  assert.equal(mapM2Status('unknown'), null);
  assert.equal(parseM2Expiry('2026-11-21T09:00:00.000Z'), Date.parse('2026-11-21T09:00:00.000Z'));
  assert.equal(parseM2Expiry(NOW), NOW);
  assert.equal(parseM2Expiry(null), null);
  assert.equal(parseM2Expiry(''), null);
  assert.equal(toEntitlementSnapshot(FIXTURES.noSubscription as M2SubscriptionDecision), null);
});

test('port factory returns a snapshot only for an allowed decision; resolver errors fail closed', () => {
  const allowed = createM2EntitlementPort(() => FIXTURES.paid as M2SubscriptionDecision, () => NOW);
  assert.equal(allowed.getEntitlement({ token: 'x' })?.planId, 'guardian');
  const denied = createM2EntitlementPort(() => FIXTURES.noSubscription as M2SubscriptionDecision, () => NOW);
  assert.equal(denied.getEntitlement(null), null);
  const broken = createM2EntitlementPort(() => { throw new Error('supabase down'); }, () => NOW);
  assert.equal(broken.getEntitlement(null), null);
  const missing = createM2EntitlementPort(() => null, () => NOW);
  assert.equal(missing.getEntitlement(null), null);
});

test('the adapter performs no network I/O, reads no env vars and imports only M4 boundary code', () => {
  const source = readFileSync(new URL('./m2-entitlement-adapter.ts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(match => match[1]);
  assert.deepEqual(imports, ['./check-boundary.ts']);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /process\.env\./);
});
