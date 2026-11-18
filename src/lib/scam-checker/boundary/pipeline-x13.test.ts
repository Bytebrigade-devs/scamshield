/**
 * M4 — X-13 event wiring test (M4-10 / FR-M4-15), 17 November 2026.
 *
 * Proves the boundary outcome converts into the eight-field `m4.check_outcome` event for every
 * terminal state, using only local stubs (no provider, network, DB or AI key).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check-boundary.ts';
import { buildCheckOutcomeEvent, validateCheckOutcomeEvent } from './x13-event.ts';
import { makeCheckDeps, makeCheckRequest, makeProvider } from '../testing/harness.ts';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const META = { eventId: 'synthetic-event-001', occurredAt: '2026-11-15T12:00:00.000Z' };
const COMPLETED_REPLY = {
  verdict: 'suspicious',
  category: 'phishing',
  taxonomy_version: '0.1.0-draft',
  reason: 'A request for credentials under time pressure.',
};

test('a completed check emits the exact completed/rules_and_ai event', async () => {
  const outcome = await runCheck(makeCheckRequest('Suspicious message.'), makeCheckDeps({
    nowMs: NOW,
    provider: makeProvider({ kind: 'ok', json: COMPLETED_REPLY }),
  }));
  assert.equal(outcome.kind, 'analysed');
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.equal(event.analysis_status, 'completed');
  assert.equal(event.analysis_mode, 'rules_and_ai');
  assert.equal(event.category_id, 'phishing');
  assert.equal(event.taxonomy_version, '0.1.0-draft');
});

test('a rules-only fallback emits limited/rules_only with unknown_other', async () => {
  const outcome = await runCheck(makeCheckRequest('Ordinary message.'), makeCheckDeps({
    nowMs: NOW,
    provider: makeProvider({ kind: 'unconfigured' }),
  }));
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.equal(event.analysis_status, 'limited');
  assert.equal(event.analysis_mode, 'rules_only');
  assert.equal(event.category_id, 'unknown_other');
});

test('a provider failure emits unavailable/none with unknown_other', async () => {
  const outcome = await runCheck(makeCheckRequest('Ordinary message.'), makeCheckDeps({
    nowMs: NOW,
    provider: makeProvider({ kind: 'failed', failure: 'timeout' }),
  }));
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.equal(event.analysis_status, 'unavailable');
  assert.equal(event.analysis_mode, 'none');
  assert.equal(event.category_id, 'unknown_other');
});

test('rejected checks emit no event at all', async () => {
  const outcome = await runCheck(makeCheckRequest('   '), makeCheckDeps({ nowMs: NOW }));
  assert.equal(outcome.kind, 'rejected');
  assert.equal(buildCheckOutcomeEvent(outcome, META), null);
});

test('the emitted event has exactly the eight allowlisted keys (no text, contact or verdict)', async () => {
  const outcome = await runCheck(makeCheckRequest('message containing https://private.example +94771234567'), makeCheckDeps({
    nowMs: NOW,
    provider: makeProvider({ kind: 'ok', json: { ...COMPLETED_REPLY, category: 'unknown_other' } }),
  }));
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.deepEqual(Object.keys(event).sort(), [
    'analysis_mode', 'analysis_status', 'category_id', 'contract_version',
    'event_id', 'event_type', 'occurred_at', 'taxonomy_version',
  ]);
  assert.doesNotMatch(JSON.stringify(event), /private\.example|94771234567|under time pressure/i);
});
