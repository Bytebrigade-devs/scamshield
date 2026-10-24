# M4 server-side check boundary

These zero-dependency TypeScript libraries implement M4-02: the server-side boundary that gates every scam check — input validation, server-side access, usage/budget gates, the local stages, one provider attempt and structural reply validation. They wrap the OpenAI provider for server-side use only; no verdict is produced beyond what a validated provider reply supplies, and a rules-only result is always explicitly labelled. The request carries only `text`; identity and quota keying come solely from a server-side entitlement snapshot.

No live provider call is made or authorized by this code: X-09 (written funding arrangement, verified provider-side cap/alert) remains open. The adapter is inert without a server-supplied key.

## Behavior

- `runCheck({ text }, deps)` in `check-boundary.ts` validates input server-side (FR-M4-01; a 2,000-character cap with an edit/reduce instruction — never silent truncation), resolves access per the access-policy mapping (active/trial allow; cancelled strictly until expiry; suspended/past-due/expired/unverifiable block), gates usage, runs the injected stages 1–2, then makes exactly one provider attempt. Missing key or unpermitted budget yields an explicitly labelled rules-only limited result; provider failure, timeout or invalid output yields unavailable. Invalid replies are never "repaired" into completed results.
- Results use only the three valid X-13 §4.1 pairs (`completed`+`rules_and_ai`, `limited`+`rules_only`, `unavailable`+`none`); `unknown_other` is the fallback category and never a "safe" outcome. Rejections are terminal, make zero provider calls and are never counted.
- `usage-store.ts` enforces the confirmed quotas per plan (Sentinel 60/5, Guardian 200/15, Aegis 600/40, trial 15) with a sliding ≈5/minute burst window; only `recordCompletion` consumes quota — denied and failed checks never count (NFR-M4-10). It is in-memory and per-process; a persistent store implementing the same port replaces it later.
- `openai-adapter.ts` targets the primary model `gpt-5.6-luna`: absent key → `unconfigured` with zero fetches; AbortController deadline; one attempt, no retry, no fallback model; enum-coded failures only, so the key cannot appear in any result or message. The key arrives only as a server-side constructor argument (the future route handler reads `process.env`); the library never reads the environment.

## Port contracts

The boundary takes every dependency as an injected port: `entitlement` (server-side snapshot: subject key, plan id, status, expiry — the still-open M2 interface records what M4 needs, and unknown plan ids block rather than receive invented quota), `usage` (admit/completion), `budget` (X-09 permission), `provider`, `clock`, and the stage functions (`extract`, `analyzeRules` — structurally compatible with `preprocess.ts`/`rule-engine.ts`, whose outputs are passed through untouched and never given a verdict). A thin Next.js `route.ts` delegating to `runCheck` lands when the app base merges; `main` is currently library-only.

The reply schema (`verdict`, `category`, `taxonomy_version`, `reason`) is a DRAFT structural contract — verdict semantics, the prompt payload and the deadline remain open under OD-M4-04. The exact duplicate/count policy remains OD-M4-06; nothing is emitted anywhere (M5 `m4.check_outcome` delivery awaits consumer agreement).

## Validation

Requires Node 22.18 or later for native TypeScript stripping; verified with Node v24.22.0. No package installation is required:

```text
node --test src/lib/scam-checker/preprocess.test.ts src/lib/scam-checker/rule-engine.test.ts src/lib/scam-checker/check-boundary.test.ts src/lib/scam-checker/usage-store.test.ts src/lib/scam-checker/openai-adapter.test.ts
```

The repository suite passes **85 tests** (52 pre-existing + 33 new), all network-free: provider interaction is stubbed and a guard test throws if the boundary itself touches `fetch`. The new tests pin the SRS acceptance scenarios by name (FS-M4-01/02/05/06/08/09, FR-M4-01/04, NFR-M4-01/02/09/10), including limit and limit+1 for the input cap and the no-call-after-denial checks.

The owner workspace separately holds a pipeline-integration test wiring the real preprocessing and rule-engine libraries through this boundary, and the frozen fixture sweep. These workspace-only artifacts are not added to this repository. Live provider integration, the persistent usage store, entitlement wiring and full-checker acceptance remain outstanding.

## Review-response fixes — 24 October 2026

A seven-finding review was verified against the code; the three boundary findings are fixed in this commit:

1. **Reply extraction (#1):** the adapter now extracts the model reply from the chat-completions envelope (`choices[0].message.content`, parsed as JSON) instead of returning the raw envelope, which `validateReply` could never accept; malformed envelopes are `bad-json` (FR-M4-04). The first live call would otherwise have been discarded as invalid.
2. **Quota race (#3):** `admitCheck` reserves one unit of monthly/daily headroom, `recordCompletion` converts one reservation, and the new `UsagePort.releaseCheck` is called on every non-completed exit — simultaneous checks can no longer push completions past the limit, while admitted-but-failed checks still never consume quota (NFR-M4-10).
3. **Trial window (#7):** the trial allowance anchors its monthly window at first use (`monthlyAnchor: 'first-use'`, 30-day periods), so crossing a calendar-month boundary no longer grants a fresh trial quota. Paid plans keep calendar-month windows.

Repository suite after the fix and the same-day recheck round: **124 tests pass** (84 stage-library + 40 boundary tests, including the review-fix and recheck regression tests). End-to-end proofs (stubbed fetch, no network): a realistic chat-completions envelope completes with a validated verdict plus rules evidence; 15 failed AI runs leave the 16th check admitted.
