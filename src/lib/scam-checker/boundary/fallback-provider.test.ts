/**
 * Bounded single-fallback provider tests (owner decision 22 Nov 2026).
 *
 * The point of these tests is the BOUND, not just the happy path: at most two attempts, only on a
 * transport failure, and never after `bad-json` — a refusal or unparseable answer must stay a
 * labelled failure rather than becoming a second model's fluent guess.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFallbackProvider, isFallbackEligible, FALLBACK_ELIGIBLE_FAILURES } from './fallback-provider.ts';
import type { ProviderAttempt, ProviderPort } from './check-boundary.ts';

const OK_PRIMARY = { kind: 'ok' as const, json: { verdict: 'high risk', from: 'primary' } };
const OK_FALLBACK = { kind: 'ok' as const, json: { verdict: 'high risk', from: 'fallback' } };

function recordingProvider(name: string, attempt: ProviderAttempt): ProviderPort & { calls: number } {
  const provider = {
    calls: 0,
    async analyze(): Promise<ProviderAttempt> {
      provider.calls += 1;
      return attempt;
    },
  };
  void name;
  return provider;
}

test('a successful primary is never followed by a fallback attempt', async () => {
  const primary = recordingProvider('primary', OK_PRIMARY);
  const fallback = recordingProvider('fallback', OK_FALLBACK);
  const provider = createFallbackProvider({ primary, fallback });

  const attempt = await provider.analyze('synthetic message');

  assert.deepEqual(attempt, OK_PRIMARY);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0, 'fallback must not be called when the primary succeeds');
});

for (const failure of FALLBACK_ELIGIBLE_FAILURES) {
  test(`a transport failure (${failure}) gets exactly one fallback attempt`, async () => {
    const primary = recordingProvider('primary', { kind: 'failed', failure });
    const fallback = recordingProvider('fallback', OK_FALLBACK);
    const provider = createFallbackProvider({ primary, fallback });

    const attempt = await provider.analyze('synthetic message');

    assert.deepEqual(attempt, OK_FALLBACK);
    assert.equal(primary.calls, 1);
    assert.equal(fallback.calls, 1, `exactly one fallback attempt for ${failure}`);
  });
}

test('FS-M4-11: invalid or refused output (bad-json) is NOT retried on the fallback model', async () => {
  const primary = recordingProvider('primary', { kind: 'failed', failure: 'bad-json' });
  const fallback = recordingProvider('fallback', OK_FALLBACK);
  const provider = createFallbackProvider({ primary, fallback });

  const attempt = await provider.analyze('synthetic message');

  assert.deepEqual(attempt, { kind: 'failed', failure: 'bad-json' });
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0, 'a refusal or unparseable answer must never be re-asked of another model');
});

test('a missing key (unconfigured) does not trigger a fallback attempt', async () => {
  const primary = recordingProvider('primary', { kind: 'unconfigured' });
  const fallback = recordingProvider('fallback', OK_FALLBACK);
  const provider = createFallbackProvider({ primary, fallback });

  const attempt = await provider.analyze('synthetic message');

  assert.deepEqual(attempt, { kind: 'unconfigured' });
  assert.equal(fallback.calls, 0);
});

test('a failing fallback ends in the honest failure state — never a third attempt', async () => {
  const primary = recordingProvider('primary', { kind: 'failed', failure: 'timeout' });
  const fallback = recordingProvider('fallback', { kind: 'failed', failure: 'network' });
  const provider = createFallbackProvider({ primary, fallback });

  const attempt = await provider.analyze('synthetic message');

  assert.deepEqual(attempt, { kind: 'failed', failure: 'network' });
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1, 'no retry loop after the fallback fails');
});

test('the fallback diagnostic fires only for an eligible transport failure', async () => {
  const seen: string[] = [];

  for (const failure of ['timeout', 'bad-json'] as const) {
    const provider = createFallbackProvider({
      primary: recordingProvider('primary', { kind: 'failed', failure }),
      fallback: recordingProvider('fallback', OK_FALLBACK),
      onFallback: (info) => seen.push(info.failure),
    });
    await provider.analyze('synthetic message');
  }

  assert.deepEqual(seen, ['timeout']);
});

test('eligibility is limited to the transport failures the contract allows', () => {
  assert.deepEqual([...FALLBACK_ELIGIBLE_FAILURES], ['timeout', 'network', 'http-error']);
  assert.equal(isFallbackEligible('timeout'), true);
  assert.equal(isFallbackEligible('http-error'), true);
  assert.equal(isFallbackEligible('bad-json'), false);
});

test('repeated checks never exceed one fallback attempt per check', async () => {
  const primary = recordingProvider('primary', { kind: 'failed', failure: 'http-error' });
  const fallback = recordingProvider('fallback', OK_FALLBACK);
  const provider = createFallbackProvider({ primary, fallback });

  await provider.analyze('first');
  await provider.analyze('second');
  await provider.analyze('third');

  assert.equal(primary.calls, 3);
  assert.equal(fallback.calls, 3, 'one fallback per check, not one shared budget and not more');
});
