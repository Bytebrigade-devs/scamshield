/**
 * M4-02 × M4-03/M4-04 — pipeline integration (WORKSPACE-ONLY).
 *
 * This file is intentionally NOT copied to the repository: like the frozen sweep
 * (code/rules/sweep.ts), it is workspace-only verification. The repository's boundary tests
 * pin behaviour with deterministic stage stubs; this suite wires the REAL preprocessing and
 * rule-engine libraries through the REAL boundary, store and OpenAI adapter to prove the
 * whole local pipeline composes as designed (sequence v0.4; M4-21 data flow).
 *
 * Still NO network: the provider is either a stub or the real adapter with an absent key
 * (unconfigured), and globalThis.fetch throws during these runs as a guard.
 *
 * ID namespace: R-M4-xx here are catalogue rule-hypothesis IDs (R-M4-01…20), NOT the Final
 * report's requirement IDs (R-M4-01…18).
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, TAXONOMY_VERSION } from './check-boundary.ts';
import type { CheckDeps, ProviderAttempt } from './check-boundary.ts';
import { extractCandidates } from '../preprocess/preprocess.ts';
import { analyzeRules } from '../rules/rule-engine.ts';
import { createOpenAIProvider } from './openai-adapter.ts';
import { createInMemoryUsageStore } from './usage-store.ts';

const NOW = 1_761_000_000_000;
const DAY_MS = 86_400_000;
const GUARDIAN = { subjectKey: 'user-1', planId: 'guardian', status: 'active' as const, expiresAt: NOW + DAY_MS };
const PH01_S =
  'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';

function depsWith(provider: CheckDeps['provider']): CheckDeps {
  return {
    session: { opaque: 'server-verified-session' },
    extract: extractCandidates,
    analyzeRules,
    entitlement: { getEntitlement: () => GUARDIAN },
    usage: createInMemoryUsageStore(),
    budget: { isProviderCallPermitted: () => ({ permitted: true }) },
    provider,
    clock: { now: () => NOW },
  };
}

test('the real pipeline composes: stages 1–2 evidence flows through a completed AI analysis', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('integration tests must not touch the network');
  };
  try {
    const reply = { verdict: 'suspicious', category: 'phishing', taxonomy_version: TAXONOMY_VERSION, reason: 'example' };
    let calls = 0;
    const provider = {
      analyze: async (_text: string): Promise<ProviderAttempt> => {
        calls += 1;
        return { kind: 'ok', json: reply };
      },
    };
    const outcome = await runCheck({ text: PH01_S }, depsWith(provider));

    assert.equal(outcome.kind, 'analysed');
    if (outcome.kind === 'analysed') {
      assert.equal(outcome.analysisStatus, 'completed');
      assert.equal(outcome.analysisMode, 'rules_and_ai');
      assert.equal(outcome.category, 'phishing');
      assert.equal(calls, 1);
      // Real stage-2 output: PH01-S fires R-M4-01/02/03 per rule-engine.test.ts — passed through untouched.
      const ruleIds = outcome.rules.matches.map((m) => m.ruleId);
      for (const id of ['R-M4-01', 'R-M4-02', 'R-M4-03']) assert.ok(ruleIds.includes(id), `${id} must be present`);
      for (const m of outcome.rules.matches) {
        assert.equal(PH01_S.slice(m.start, m.end), m.excerpt, 'evidence offsets remain exact against the input');
      }
      // Real stage-1 output: the phishing URL is extracted as an untrusted candidate.
      assert.deepEqual(outcome.candidates, extractCandidates(PH01_S));
      assert.ok(outcome.candidates.urls.includes('https://account-verify.example/restore'));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the real adapter with an absent key degrades the same pipeline to labelled rules-only', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('integration tests must not touch the network');
  };
  try {
    const provider = createOpenAIProvider({ apiKey: undefined }); // real adapter, no key
    const outcome = await runCheck({ text: PH01_S }, depsWith(provider));

    assert.equal(outcome.kind, 'analysed');
    if (outcome.kind === 'analysed') {
      assert.equal(outcome.analysisStatus, 'limited');
      assert.equal(outcome.analysisMode, 'rules_only');
      assert.equal(outcome.category, 'unknown_other');
      assert.equal(outcome.reply, null);
      assert.ok(outcome.limitations.length > 0, 'the rules-only label and its limitations are explicit');
      assert.ok(outcome.rules.matches.some((m) => m.ruleId === 'R-M4-01'), 'real rule evidence is still shown');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
