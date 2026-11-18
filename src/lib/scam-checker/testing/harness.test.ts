/**
 * M4 — harness smoke tests (M4-19 / X-06).
 *
 * These prove the builders are usable and that the default deps describe the honest
 * rules-only path; they are not a second copy of the boundary suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCheck } from '../boundary/check-boundary.ts';
import {
  fixedClock, makeBudget, makeCheckDeps, makeCheckRequest, makeEntitlement,
  makeEntitlementPort, makeProvider, makeUsageStore,
} from './harness.ts';

test('fixedClock returns the same time on every call', () => {
  const clock = fixedClock(1234);
  assert.equal(clock.now(), 1234);
  assert.equal(clock.now(), 1234);
});

test('makeEntitlement defaults to a valid entitled snapshot and supports overrides', () => {
  const snapshot = makeEntitlement();
  assert.deepEqual(snapshot, {
    subjectKey: 'subject-a', planId: 'guardian', status: 'active',
    expiresAt: Date.parse('2026-12-01T00:00:00.000Z'),
  });
  assert.equal(makeEntitlement({ status: 'trial', planId: 'sentinel' }).status, 'trial');
});

test('makeCheckDeps defaults produce the honest rules-only outcome (no provider call)', async () => {
  const deps = makeCheckDeps();
  const outcome = await runCheck(makeCheckRequest('Please verify this message.'), deps);
  assert.equal(outcome.kind, 'analysed');
  assert.equal(outcome.analysisStatus, 'limited');
  assert.equal(outcome.analysisMode, 'rules_only');
  assert.equal(outcome.reply, null);
  assert.equal(outcome.category, 'unknown_other');
});

test('makeCheckDeps lets a test inject a completed provider reply and fixed clock', async () => {
  const nowMs = Date.parse('2026-11-15T12:00:00.000Z');
  const deps = makeCheckDeps({
    nowMs,
    provider: makeProvider({
      kind: 'ok',
      json: { verdict: 'suspicious', category: 'phishing', taxonomy_version: '0.1.0-draft', reason: 'A request for credentials.' },
    }),
  });
  const outcome = await runCheck(makeCheckRequest('Suspicious message.'), deps);
  assert.equal(outcome.kind, 'analysed');
  assert.equal(outcome.analysisStatus, 'completed');
  assert.equal(outcome.category, 'phishing');
  assert.equal(deps.clock.now(), nowMs);
});

test('makeEntitlementPort can return null and makeBudget can deny provider calls', () => {
  assert.equal(makeEntitlementPort(null).getEntitlement(null), null);
  assert.equal(makeBudget(false).isProviderCallPermitted().permitted, false);
});

test('the harness itself performs no network I/O and reads no environment variables', () => {
  const source = readFileSync(new URL('./harness.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /process\.env\./);
  const usage = makeUsageStore();
  assert.equal(typeof usage.admitCheck, 'function');
});
