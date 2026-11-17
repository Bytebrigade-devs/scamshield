/**
 * M4 — X-13 event wiring test (M4-10 / FR-M4-15), repository slice.
 *
 * Proves the boundary outcome converts into the eight-field `m4.check_outcome` event for every
 * terminal state using local stubs only (no provider, network, DB or AI key).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check-boundary.ts';
import type { CheckDeps, ProviderAttempt } from './check-boundary.ts';
import { createInMemoryUsageStore } from './usage-store.ts';
import { buildCheckOutcomeEvent, validateCheckOutcomeEvent } from './x13-event.ts';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const META = { eventId: 'synthetic-event-001', occurredAt: '2026-11-15T12:00:00.000Z' };
const COMPLETED_REPLY = {
  verdict: 'suspicious',
  category: 'phishing',
  taxonomy_version: '0.1.0-draft',
  reason: 'A request for credentials under time pressure.',
};

function deps(provider: CheckDeps['provider']): CheckDeps {
  return {
    session: { token: 'synthetic-session' },
    extract: () => ({ urls: [], emails: [], phones: [], wrappedCandidates: [] }),
    analyzeRules: () => ({ matches: [] }),
    entitlement: {
      getEntitlement: () => ({
        subjectKey: 'subject-a', planId: 'guardian', status: 'active', expiresAt: NOW + 86_400_000,
      }),
    },
    usage: createInMemoryUsageStore(),
    budget: { isProviderCallPermitted: () => ({ permitted: true }) },
    provider,
    clock: { now: () => NOW },
  };
}

function provider(attempt: ProviderAttempt): CheckDeps['provider'] {
  return { analyze: async () => attempt };
}

test('a completed check emits the exact completed/rules_and_ai event', async () => {
  const outcome = await runCheck({ text: 'Suspicious message.' }, deps(provider({ kind: 'ok', json: COMPLETED_REPLY })));
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.equal(event.analysis_status, 'completed');
  assert.equal(event.analysis_mode, 'rules_and_ai');
  assert.equal(event.category_id, 'phishing');
  assert.equal(event.taxonomy_version, '0.1.0-draft');
});

test('a rules-only fallback emits limited/rules_only with unknown_other', async () => {
  const outcome = await runCheck({ text: 'Ordinary message.' }, deps(provider({ kind: 'unconfigured' })));
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.equal(event.analysis_status, 'limited');
  assert.equal(event.analysis_mode, 'rules_only');
  assert.equal(event.category_id, 'unknown_other');
});

test('a provider failure emits unavailable/none with unknown_other', async () => {
  const outcome = await runCheck({ text: 'Ordinary message.' }, deps(provider({ kind: 'failed', failure: 'timeout' })));
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.ok(validateCheckOutcomeEvent(event));
  assert.equal(event.analysis_status, 'unavailable');
  assert.equal(event.analysis_mode, 'none');
  assert.equal(event.category_id, 'unknown_other');
});

test('rejected checks emit no event at all', async () => {
  const outcome = await runCheck({ text: '   ' }, deps(provider({ kind: 'unconfigured' })));
  assert.equal(outcome.kind, 'rejected');
  assert.equal(buildCheckOutcomeEvent(outcome, META), null);
});

test('the emitted event has exactly the eight allowlisted keys (no text, contact or verdict)', async () => {
  const outcome = await runCheck(
    { text: 'message containing https://private.example +94771234567' },
    deps(provider({ kind: 'ok', json: { ...COMPLETED_REPLY, category: 'unknown_other' } })),
  );
  const event = buildCheckOutcomeEvent(outcome, META)!;
  assert.deepEqual(Object.keys(event).sort(), [
    'analysis_mode', 'analysis_status', 'category_id', 'contract_version',
    'event_id', 'event_type', 'occurred_at', 'taxonomy_version',
  ]);
  assert.doesNotMatch(JSON.stringify(event), /private\.example|94771234567|under time pressure/i);
});
