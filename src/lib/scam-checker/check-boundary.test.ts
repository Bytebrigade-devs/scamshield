/**
 * M4-02 — check boundary tests (TDD, written first).
 *
 * Requirements pinned: FR-M4-01 (server-side validation; browser-bypass still rejected),
 * FR-M4-04 (invoked through the server; structured reply validated; invalid output never a
 * successful AI result), FS-M4-01 (empty/whitespace/wrong type → reject; provider stub
 * records zero calls), FS-M4-02 (size cap: limit and limit + 1; edit/reduce instruction; no
 * truncation), FS-M4-05 (missing key → labelled rules-only, never unavailable-as-verdict),
 * FS-M4-06 (timeout → unavailable; one attempt, no fallback), FS-M4-08 (quota/rate/budget
 * denial declines the provider call; no bypass from a changed browser identifier),
 * FS-M4-09 (server-enforced access), NFR-M4-01 spirit (the boundary itself never fetches),
 * NFR-M4-02 (authorization from the server-side snapshot only), NFR-M4-10 (failures never
 * count as successful checks), X-13 §4.1 (only the three valid status/mode pairs).
 *
 * Grounding: stage functions are deterministic stubs with known outputs so boundary
 * behaviour is pinned in isolation; the real M4-03/M4-04 libraries are wired through this
 * boundary in the workspace-only pipeline-integration.test.ts. Quotas and limits come from
 * contracts/M4-usage-quotas-and-funding-decision.md §1 (18 Oct 2026); the access mapping
 * from contracts/M4-access-policy-decision.md. No network I/O of any kind occurs here.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runCheck,
  resolveAccess,
  validateReply,
  DEFAULT_LIMITS,
  PLAN_ALLOWANCES,
  TAXONOMY_VERSION,
  EMPTY_INPUT_MESSAGE,
  ACCESS_BLOCKED_MESSAGE,
  RULES_ONLY_LIMITATION,
  UNAVAILABLE_LIMITATION,
} from './check-boundary.ts';
import type {
  BudgetPort,
  CheckDeps,
  CheckRequest,
  ClockPort,
  EntitlementSnapshot,
  ProviderAttempt,
  ProviderPort,
  StageCandidates,
  StageRules,
  UsagePort,
} from './check-boundary.ts';
import { createInMemoryUsageStore } from './usage-store.ts';

const NOW = 1_761_000_000_000; // fixed epoch ms — deterministic clock
const DAY_MS = 86_400_000;

const GUARDIAN: EntitlementSnapshot = { subjectKey: 'user-1', planId: 'guardian', status: 'active', expiresAt: NOW + DAY_MS };
const SENTINEL: EntitlementSnapshot = { subjectKey: 'user-1', planId: 'sentinel', status: 'active', expiresAt: NOW + DAY_MS };

const VALID_TEXT =
  'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';
const FAKE_CANDIDATES: StageCandidates = { urls: ['https://account-verify.example/restore'], emails: [], phones: [] };
const FAKE_RULES: StageRules = {
  matches: [{ ruleId: 'R-M4-01', excerpt: 'suspended', start: 26, end: 35, contextNote: 'threat' }],
};
const VALID_REPLY = {
  verdict: 'suspicious',
  category: 'phishing',
  taxonomy_version: TAXONOMY_VERSION,
  reason: 'credential request combined with a threat',
};

function makeDeps(
  options: {
    snapshot?: EntitlementSnapshot | null;
    usage?: UsagePort;
    budget?: BudgetPort;
    provider?: ProviderPort;
    providerAttempt?: ProviderAttempt;
    clock?: ClockPort;
  } = {},
): { deps: CheckDeps; calls: string[] } {
  const calls: string[] = [];
  const attempt: ProviderAttempt = options.providerAttempt ?? { kind: 'ok', json: VALID_REPLY };
  const provider: ProviderPort = options.provider ?? {
    analyze: async (text: string): Promise<ProviderAttempt> => {
      calls.push(text);
      return attempt;
    },
  };
  const deps: CheckDeps = {
    session: { opaque: 'server-verified-session' },
    extract: (): StageCandidates => FAKE_CANDIDATES,
    analyzeRules: (text: string): StageRules => (text === VALID_TEXT ? FAKE_RULES : { matches: [] }),
    entitlement: {
      getEntitlement: (): EntitlementSnapshot | null =>
        options.snapshot === undefined ? GUARDIAN : options.snapshot,
    },
    usage: options.usage ?? createInMemoryUsageStore(),
    budget: options.budget ?? { isProviderCallPermitted: () => ({ permitted: true }) },
    provider,
    clock: options.clock ?? { now: () => NOW },
  };
  return { deps, calls };
}

// ---- FS-M4-01 / FR-M4-01: server-side input validation ----

test('FS-M4-01: empty, whitespace-only and non-string input are rejected before anything runs', async () => {
  const { deps, calls } = makeDeps();
  for (const bad of ['', '   ', '\n\t ', 42, null, undefined, { text: 'hi' }]) {
    const outcome = await runCheck({ text: bad }, deps);
    assert.equal(outcome.kind, 'rejected', `input ${JSON.stringify(bad)} must be rejected`);
    if (outcome.kind === 'rejected') {
      assert.equal(outcome.reason, 'invalid-input');
      assert.equal(outcome.message, EMPTY_INPUT_MESSAGE);
    }
  }
  assert.equal(calls.length, 0, 'provider stub records zero calls');
});

// ---- FS-M4-02: size cap — limit and limit + 1 ----

test('FS-M4-02: input at exactly the 2,000-character cap is accepted and analyses', async () => {
  const { deps, calls } = makeDeps();
  const atCap = 'a'.repeat(2_000);
  const outcome = await runCheck({ text: atCap }, deps);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') assert.equal(outcome.analysisStatus, 'completed');
  assert.equal(calls.length, 1, 'the full (uncapped, untruncated) text reaches the provider');
  assert.equal(calls[0].length, 2_000, 'the text is never silently truncated');
});

test('FS-M4-02: input one character over the cap is rejected with an edit/reduce instruction', async () => {
  const { deps, calls } = makeDeps();
  const outcome = await runCheck({ text: 'a'.repeat(2_001) }, deps);
  assert.equal(outcome.kind, 'rejected');
  if (outcome.kind === 'rejected') {
    assert.equal(outcome.reason, 'invalid-input');
    assert.match(outcome.message, /2,000/);
    assert.match(outcome.message, /edit or reduce/i);
  }
  assert.equal(calls.length, 0, 'provider stub records zero calls');
});

// ---- FS-M4-09 / access-policy mapping (contracts/M4-access-policy-decision.md) ----

test('resolveAccess: active, trial and cancelled-within-entitlement are allowed with the right allowance', () => {
  const active = resolveAccess(GUARDIAN, NOW);
  assert.deepEqual(active, { allowed: true, allowance: PLAN_ALLOWANCES.guardian });

  const trial = resolveAccess(
    { subjectKey: 'user-2', planId: 'guardian', status: 'trial', expiresAt: NOW + DAY_MS },
    NOW,
  );
  assert.deepEqual(trial, { allowed: true, allowance: PLAN_ALLOWANCES.trial }, 'trial always gets the trial allowance');

  const cancelledWithin = resolveAccess(
    { subjectKey: 'user-3', planId: 'sentinel', status: 'cancelled', expiresAt: NOW + 1 },
    NOW,
  );
  assert.deepEqual(cancelledWithin, { allowed: true, allowance: PLAN_ALLOWANCES.sentinel }, 'access until entitlement expiry');

  // Case-insensitive plan ids from the decision record (Sentinel/Guardian/Aegis).
  const mixed = resolveAccess(
    { subjectKey: 'user-4', planId: 'Aegis', status: 'active', expiresAt: NOW + DAY_MS },
    NOW,
  );
  assert.deepEqual(mixed, { allowed: true, allowance: PLAN_ALLOWANCES.aegis });
});

test('resolveAccess: expired, cancelled-after-expiry, suspended, past-due, unverifiable and unknown-plan entitlements are blocked', () => {
  const cases: (EntitlementSnapshot | null)[] = [
    null, // missing/unverifiable session
    { subjectKey: 'u', planId: 'guardian', status: 'active', expiresAt: NOW }, // expiry reached
    { subjectKey: 'u', planId: 'guardian', status: 'cancelled', expiresAt: NOW - 1 }, // cancelled at/after expiry
    { subjectKey: 'u', planId: 'guardian', status: 'suspended', expiresAt: NOW + DAY_MS },
    { subjectKey: 'u', planId: 'guardian', status: 'past_due', expiresAt: NOW + DAY_MS },
    { subjectKey: 'u', planId: 'guardian', status: 'active', expiresAt: Number.NaN }, // unverifiable expiry
    { subjectKey: 'u', planId: 'premium', status: 'active', expiresAt: NOW + DAY_MS }, // unknown plan: no invented quota
  ];
  for (const snapshot of cases) {
    assert.deepEqual(resolveAccess(snapshot, NOW), { allowed: false }, `must block ${JSON.stringify(snapshot)}`);
  }
});

test('FS-M4-09: an unverifiable session is rejected access-blocked with zero provider calls', async () => {
  const { deps, calls } = makeDeps({ snapshot: null });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'rejected');
  if (outcome.kind === 'rejected') {
    assert.equal(outcome.reason, 'access-blocked');
    assert.equal(outcome.message, ACCESS_BLOCKED_MESSAGE);
  }
  assert.equal(calls.length, 0);
});

// ---- FS-M4-08 / NFR-M4-09: usage denials decline the provider call ----

test('FS-M4-08: a spent monthly quota denies the check before any provider call', async () => {
  const usage = createInMemoryUsageStore();
  for (let i = 0; i < PLAN_ALLOWANCES.sentinel.monthly; i += 1) {
    usage.recordCompletion({ key: 'user-1' }, NOW);
  }
  const { deps, calls } = makeDeps({ snapshot: SENTINEL, usage });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'rejected');
  if (outcome.kind === 'rejected') {
    assert.equal(outcome.reason, 'quota-denied');
    assert.match(outcome.message, /monthly/i);
  }
  assert.equal(calls.length, 0, 'a quota denial must decline the provider call entirely');
});

test('FS-M4-08: a spent daily cap denies the check before any provider call', async () => {
  const usage = createInMemoryUsageStore();
  for (let i = 0; i < PLAN_ALLOWANCES.sentinel.daily; i += 1) {
    usage.recordCompletion({ key: 'user-1' }, NOW);
  }
  const { deps, calls } = makeDeps({ snapshot: SENTINEL, usage });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'rejected');
  if (outcome.kind === 'rejected') {
    assert.equal(outcome.reason, 'quota-denied');
    assert.match(outcome.message, /daily/i);
  }
  assert.equal(calls.length, 0);
});

test('FS-M4-08: the burst guard denies the sixth check in a minute with zero further provider calls', async () => {
  const { deps, calls } = makeDeps(); // guardian: daily 15, so only the burst guard (5/min) can fire
  for (let i = 0; i < 5; i += 1) {
    const outcome = await runCheck({ text: VALID_TEXT }, deps);
    assert.equal(outcome.kind, 'analysed', `check ${i + 1} must complete`);
  }
  assert.equal(calls.length, 5);
  const sixth = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(sixth.kind, 'rejected');
  if (sixth.kind === 'rejected') assert.equal(sixth.reason, 'rate-denied');
  assert.equal(calls.length, 5, 'the rate-denied check makes no provider call');
});

test('NFR-M4-02/FS-M4-08: browser-supplied request fields are ignored — identity comes only from the entitlement port', async () => {
  const blocked: EntitlementSnapshot | null = null;
  const { deps, calls } = makeDeps({ snapshot: blocked });
  const outcome = await runCheck(
    { text: VALID_TEXT, browserId: 'forged-identifier', planId: 'aegis' } as CheckRequest,
    deps,
  );
  assert.equal(outcome.kind, 'rejected');
  if (outcome.kind === 'rejected') assert.equal(outcome.reason, 'access-blocked');
  assert.equal(calls.length, 0, 'a forged identifier cannot rescue a denied subject');
});

// ---- FS-M4-05: missing key / unpermitted budget disable the live call ----

test('FS-M4-05: an unconfigured provider yields an explicitly labelled rules-only limited result', async () => {
  const { deps } = makeDeps({ providerAttempt: { kind: 'unconfigured' } });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') {
    assert.equal(outcome.analysisStatus, 'limited');
    assert.equal(outcome.analysisMode, 'rules_only'); // X-13 §4.1 pair
    assert.equal(outcome.category, 'unknown_other');
    assert.equal(outcome.reply, null, 'no AI verdict is implied');
    assert.deepEqual(outcome.limitations, [RULES_ONLY_LIMITATION]);
    assert.deepEqual(outcome.rules, FAKE_RULES, 'stages still ran and their evidence is passed through');
    assert.deepEqual(outcome.candidates, FAKE_CANDIDATES);
  }
});

test('FS-M4-05/NFR-M4-09: an unpermitted budget yields the labelled rules-only result with no provider call', async () => {
  const { deps, calls } = makeDeps({
    budget: { isProviderCallPermitted: () => ({ permitted: false, reason: 'unverified' }) },
  });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') {
    assert.equal(outcome.analysisStatus, 'limited');
    assert.equal(outcome.analysisMode, 'rules_only');
    assert.deepEqual(outcome.limitations, [RULES_ONLY_LIMITATION]);
  }
  assert.equal(calls.length, 0, 'the boundary declines the provider call before asking');
});

// ---- FR-M4-04: reply validation — invalid output never becomes a successful AI result ----

test('FR-M4-04: a valid reply completes the analysis and passes stage evidence through untouched', async () => {
  const { deps } = makeDeps();
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'analysed');
  if (outcome.kind === 'analysed') {
    assert.equal(outcome.analysisStatus, 'completed');
    assert.equal(outcome.analysisMode, 'rules_and_ai'); // X-13 §4.1 pair
    assert.equal(outcome.category, 'phishing');
    assert.deepEqual(outcome.reply, { verdictLabel: 'suspicious', category: 'phishing', reason: VALID_REPLY.reason });
    assert.deepEqual(outcome.rules, FAKE_RULES, 'rule evidence is never altered or given a verdict');
    assert.deepEqual(outcome.candidates, FAKE_CANDIDATES);
    assert.deepEqual(outcome.limitations, []);
  }
});

test('FR-M4-04/FS-M4-06: provider failures and invalid replies end unavailable — never a completed AI result', async () => {
  const failures: ProviderAttempt[] = [
    { kind: 'failed', failure: 'timeout' },
    { kind: 'failed', failure: 'network' },
    { kind: 'failed', failure: 'http-error' },
    { kind: 'failed', failure: 'bad-json' },
    { kind: 'ok', json: 'not-an-object' },
    { kind: 'ok', json: { category: 'phishing', taxonomy_version: TAXONOMY_VERSION } }, // verdict missing
    { kind: 'ok', json: { verdict: 'suspicious', taxonomy_version: '9.9.9' } }, // unsupported version
    { kind: 'ok', json: { verdict: 'suspicious', taxonomy_version: TAXONOMY_VERSION, category: 42 } },
  ];
  for (const attempt of failures) {
    const { deps } = makeDeps({ providerAttempt: attempt });
    const outcome = await runCheck({ text: VALID_TEXT }, deps);
    assert.equal(outcome.kind, 'analysed', `${JSON.stringify(attempt)} must still run stages`);
    if (outcome.kind === 'analysed') {
      assert.equal(outcome.analysisStatus, 'unavailable', `${JSON.stringify(attempt)} must not complete`);
      assert.equal(outcome.analysisMode, 'none'); // X-13 §4.1 pair
      assert.equal(outcome.category, 'unknown_other', 'never a legitimate/safe outcome');
      assert.equal(outcome.reply, null);
      assert.deepEqual(outcome.limitations, [UNAVAILABLE_LIMITATION]);
    }
  }
});

test('FR-M4-04/X-13 §2.1: unrecognized or absent categories fall back to unknown_other, not an error', async () => {
  const unknownCategory = { verdict: 'suspicious', category: 'crypto_giveaway', taxonomy_version: TAXONOMY_VERSION };
  const { deps: d1 } = makeDeps({ providerAttempt: { kind: 'ok', json: unknownCategory } });
  const first = await runCheck({ text: VALID_TEXT }, d1);
  assert.equal(first.kind, 'analysed');
  if (first.kind === 'analysed') {
    assert.equal(first.analysisStatus, 'completed');
    assert.equal(first.category, 'unknown_other', 'an unrecognized category is mapped, never exported as free text');
  }

  const noCategory = { verdict: 'suspicious', taxonomy_version: TAXONOMY_VERSION };
  const { deps: d2 } = makeDeps({ providerAttempt: { kind: 'ok', json: noCategory } });
  const second = await runCheck({ text: VALID_TEXT }, d2);
  assert.equal(second.kind, 'analysed');
  if (second.kind === 'analysed') assert.equal(second.category, 'unknown_other');
});

test('FR-M4-04: validateReply rejects non-objects, missing fields and bad types structurally', () => {
  assert.equal(validateReply(null), null);
  assert.equal(validateReply(undefined), null);
  assert.equal(validateReply([VALID_REPLY]), null);
  assert.equal(validateReply(42), null);
  assert.equal(validateReply({ verdict: '', taxonomy_version: TAXONOMY_VERSION }), null);
  assert.equal(validateReply({ verdict: 'x', taxonomy_version: TAXONOMY_VERSION, reason: 7 }), null);
  assert.deepEqual(validateReply({ verdict: ' x ', category: 'Phishing', taxonomy_version: TAXONOMY_VERSION }), {
    verdictLabel: 'x',
    category: 'phishing',
    reason: null,
  });
});

// ---- FS-M4-06 / NFR-M4-10: one attempt; failures never count ----

test('FS-M4-06: a timeout makes exactly one provider attempt — no retry, no fallback model', async () => {
  const { deps, calls } = makeDeps({ providerAttempt: { kind: 'failed', failure: 'timeout' } });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(outcome.kind, 'analysed');
  assert.equal(calls.length, 1, 'exactly one attempt (owner decision 19 Oct 2026: no automatic fallback)');
});

test('NFR-M4-10: a failed provider attempt is not counted — the daily slot stays available', async () => {
  let attempt: ProviderAttempt = { kind: 'ok', json: VALID_REPLY };
  const calls: string[] = [];
  const provider: ProviderPort = {
    analyze: async (text: string): Promise<ProviderAttempt> => {
      calls.push(text);
      return attempt;
    },
  };
  // The clock advances past the burst window between checks so only the daily cap can fire.
  let now = NOW;
  const { deps } = makeDeps({ snapshot: SENTINEL, provider, clock: { now: () => now } }); // sentinel: daily 5
  const stepPastBurst = () => {
    now += DEFAULT_LIMITS.burstWindowMs + 1;
  };

  for (let i = 0; i < 4; i += 1) {
    stepPastBurst();
    const ok = await runCheck({ text: VALID_TEXT }, deps);
    assert.equal(ok.kind, 'analysed', `check ${i + 1} completes (daily ${i + 1}/5)`);
  }
  stepPastBurst();
  attempt = { kind: 'failed', failure: 'timeout' };
  const failed = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(failed.kind, 'analysed');
  if (failed.kind === 'analysed') assert.equal(failed.analysisStatus, 'unavailable');

  stepPastBurst();
  attempt = { kind: 'ok', json: VALID_REPLY };
  const afterFailure = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(afterFailure.kind, 'analysed', 'the failed attempt consumed no quota — the 5th daily slot is still open');
  if (afterFailure.kind === 'analysed') assert.equal(afterFailure.analysisStatus, 'completed');

  stepPastBurst();
  const denied = await runCheck({ text: VALID_TEXT }, deps);
  assert.equal(denied.kind, 'rejected', 'only now is the daily cap genuinely reached (5 completions)');
  if (denied.kind === 'rejected') assert.equal(denied.reason, 'quota-denied');
  assert.equal(calls.length, 6);
});

// ---- outcome shape / purity ----

test('a rejected outcome carries only kind, reason and message — no analysis fields, no event data', async () => {
  const { deps } = makeDeps({ snapshot: null });
  const outcome = await runCheck({ text: VALID_TEXT }, deps);
  assert.deepEqual(outcome, { kind: 'rejected', reason: 'access-blocked', message: ACCESS_BLOCKED_MESSAGE });
});

test('NFR-M4-01 spirit: the boundary itself never performs network I/O', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('the boundary must not fetch — providers are injected ports');
  };
  try {
    const { deps } = makeDeps();
    const outcome = await runCheck({ text: VALID_TEXT }, deps);
    assert.equal(outcome.kind, 'analysed');
    if (outcome.kind === 'analysed') assert.equal(outcome.analysisStatus, 'completed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
