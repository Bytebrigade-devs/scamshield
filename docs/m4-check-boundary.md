# M4 server-side check boundary

These zero-dependency TypeScript libraries implement M4-02: the server-side boundary that gates every scam check — input validation, server-side access, usage/budget gates, the local stages, one provider attempt and structural reply validation. They wrap the OpenAI provider for server-side use only; no verdict is produced beyond what a validated provider reply supplies, and a rules-only result is always explicitly labelled. The request carries only `text`; identity and quota keying come solely from a server-side entitlement snapshot.

No live provider call is made or authorized by this code: X-09 (written funding arrangement, verified provider-side cap/alert) remains open. The adapter is inert without a server-supplied key.

**ID namespace:** `R-M4-xx` IDs here are catalogue rule-hypothesis IDs (`R-M4-01…20`), not the Final report's requirement IDs (`R-M4-01…18`). E.g. catalogue `R-M4-13` is the prize/reward claim-link rule; report `R-M4-13` is the own-history requirement (SRS `FR-M4-13`).

## Behavior

- `runCheck({ text }, deps)` in `check-boundary.ts` validates input server-side (FR-M4-01; a 2,000-character cap with an edit/reduce instruction — never silent truncation), resolves access per the access-policy mapping (active/trial allow; cancelled strictly until expiry; suspended/past-due/expired/unverifiable block), gates usage, runs the injected stages 1–2, then makes exactly one provider attempt. Missing key or unpermitted budget yields an explicitly labelled rules-only limited result; provider failure, timeout or invalid output yields unavailable. Invalid replies are never "repaired" into completed results.
- Results use only the three valid X-13 §4.1 pairs (`completed`+`rules_and_ai`, `limited`+`rules_only`, `unavailable`+`none`); `unknown_other` is the fallback category and never a "safe" outcome. Rejections are terminal, make zero provider calls and are never counted.
- `usage-store.ts` enforces the confirmed quotas per plan (Sentinel 60/5, Guardian 200/15, Aegis 600/40, trial 15) with a sliding ≈5/minute burst window; only `recordCompletion` consumes quota — denied and failed checks never count (NFR-M4-10). It is in-memory and per-process; a persistent store implementing the same port replaces it later.
- `openai-adapter.ts` targets the primary model **`gpt-6-luna`** (promoted from `gpt-5.6-luna` on 22 November 2026): absent key → `unconfigured` with zero fetches; AbortController deadline (default 45 s, injectable between 1 ms and 60 s for offline timeout tests); the provider may make **at most one bounded fallback attempt** on `gpt-5.6-luna`, and only on a transport-class failure (`timeout`/`network`/`http-error`) — never on `bad-json`, a refusal or any answer-confidence reason (see `fallback-provider.ts`); a failed fallback still ends in the labelled `unavailable` state; enum-coded failures only, so the key cannot appear in any result or message. A 429 exposes a bounded `retryAfterSeconds` hint without retrying. The key arrives only as a server-side constructor argument (the future route handler reads `process.env`); the library never reads the environment.

## Port contracts

The boundary takes every dependency as an injected port: `entitlement` (server-side snapshot: subject key, plan id, status, expiry — the still-open M2 interface records what M4 needs, and unknown plan ids block rather than receive invented quota), `usage` (admit/completion), `budget` (X-09 permission), `provider`, `clock`, and the stage functions (`extract`, `analyzeRules` — structurally compatible with `preprocess.ts`/`rule-engine.ts`, whose outputs are passed through untouched and never given a verdict). A thin Next.js `route.ts` delegating to `runCheck` lands when the app base merges; `main` is currently library-only.

The reply schema (`verdict`, `category`, `taxonomy_version`, `reason`) is a DRAFT contract. The transport allow-list below does not settle verdict semantics, measured accuracy or confidence (OD-M4-04 remains open). The exact duplicate/count policy remains OD-M4-06; nothing is emitted anywhere (M5 `m4.check_outcome` delivery awaits consumer agreement).

## Validation

Requires Node 22.18 or later for native TypeScript stripping; verified with Node v24.22.0. No package installation is required:

```text
node --test src/lib/scam-checker/preprocess/preprocess.test.ts src/lib/scam-checker/rules/rule-engine.test.ts src/lib/scam-checker/boundary/check-boundary.test.ts src/lib/scam-checker/boundary/usage-store.test.ts src/lib/scam-checker/boundary/openai-adapter.test.ts
```

The current repository suite passes **141 tests** (91 stage-library + 50 boundary/adapter/store), verified locally with Node **v24.22.1**, all network-free: provider interaction is stubbed and a guard test throws if the boundary itself touches `fetch`. Tests pin the SRS acceptance scenarios by name (FS-M4-01/02/05/06/08/09, FR-M4-01/04, NFR-M4-01/02/09/10), including limit and limit+1 for the input cap and the no-call-after-denial checks. The original 85-test baseline and the 124-test review round below are historical counts, not current totals.

`.github/workflows/m4-tests.yml` runs the same command on Windows and Linux with Node 24.22.1, read-only permissions and SHA-pinned actions. There are no dependencies to install. **GitHub CI verified:** the `M4 library tests` workflow passed on this branch on 27 October 2026 (run 40463593725, 26 s, ubuntu + windows).

The owner workspace separately holds a pipeline-integration test wiring the real preprocessing and rule-engine libraries through this boundary, and the frozen fixture sweep. These workspace-only artifacts are not added to this repository. Live provider integration, the persistent usage store, entitlement wiring and full-checker acceptance remain outstanding.

## Review-response fixes — 24 October 2026

A seven-finding review was verified against the code; the three boundary findings are fixed in this commit:

1. **Reply extraction (#1):** the adapter now extracts the model reply from the chat-completions envelope (`choices[0].message.content`, parsed as JSON) instead of returning the raw envelope, which `validateReply` could never accept; malformed envelopes are `bad-json` (FR-M4-04). The first live call would otherwise have been discarded as invalid.
2. **Quota race (#3):** `admitCheck` reserves one unit of monthly/daily headroom, `recordCompletion` converts one reservation, and the new `UsagePort.releaseCheck` is called on every non-completed exit — simultaneous checks can no longer push completions past the limit, while admitted-but-failed checks still never consume quota (NFR-M4-10).
3. **Trial window (#7):** the trial allowance anchors its monthly window at first use (`monthlyAnchor: 'first-use'`, 30-day periods), so crossing a calendar-month boundary no longer grants a fresh trial quota. Paid plans keep calendar-month windows.

Historical repository suite after the 24 October fix and same-day recheck round: **124 tests passed** (84 stage-library + 40 boundary tests, including the review-fix and recheck regression tests). End-to-end proofs (stubbed fetch, no network): a realistic chat-completions envelope completes with a validated verdict plus rules evidence; 15 failed AI runs leave the 16th check admitted.

## PR review hardening — 27 October 2026

- Verdicts are no longer arbitrary provider text: trim/lowercase normalization must match exactly `suspicious`, `potentially suspicious`, `no obvious indicators`, `high risk` or `undetermined`. These are draft transport labels, separate from X-13 categories. `no obvious indicators` is not proof of safety. Other labels (including `safe`, `legitimate`, `clean` and markup) fail closed to unavailable; no keyword blacklist or repaired verdict is used. Raw verdicts are capped at 64 UTF-16 code units and reasons at 1,000; oversized fields are rejected, never silently truncated.
- Absent, unrecognized-string or null categories map to `unknown_other`; non-string/non-null category values still reject the reply. `StageCandidates` explicitly exposes optional `wrappedCandidates`, separately from verbatim `urls`.
- Blank/whitespace-only keys disable calls; surrounding whitespace is removed from configured keys. Every default or custom object payload receives `max_completion_tokens: 4096` by default (`outputTokenBudget` accepts a server-side 512–8192 override). Actual response bytes are limited to 64 KiB while streaming (not by trusting Content-Length), with cancellation on overflow. UTF-8 split across chunks stays intact. Body-read deadline errors are classified as timeout rather than network failure. These per-attempt limits do not replace the aggregate budget gate or prove provider-side spend-cap enforcement. **Limit values changed on 18 November 2026:** the workspace build (45 s deadline, 4,096 default tokens) now matches the library; earlier 20 s / 1,000-token notes describe the superseded repository revision.
- The default draft prompt now states the supported taxonomy version, allowed labels/categories and reason bound, so it can satisfy validation without guessing. Custom payload builders must also follow this draft reply contract; the adapter still enforces their token cap.
- Completion accounting must be atomic: `recordCompletion` either commits the reservation-to-usage conversion or throws with no mutation. Only then can the existing `finally` safely release a failed check's still-held reservation. A regression test pins rollback cleanup while another request remains pending. No future persistent store is implemented or claimed here; it must transact/reconcile internally, never throw after committing. Moving the completed flag before the write would strand reservations on rollback and is deliberately not done.
- Companion stage hardening also bounds amount matching to a line, verifies actual shortener hostnames and prevents sentence punctuation from entering stitched URL readings. The generic hostname-shape heuristic remains evidence-only and can match benign hyphenated names; it is not brand verification. No UI or workspace files are published.

## Model policy and bounded fallback — 23 November 2026

Publishes the 22 November owner decision into the shared repository. `gpt-6-luna` is the **primary model** (promoted on the 40-pair / 80-message comparison: 39/39 intended scams flagged, 40/40 legitimate near-matches cleared versus 29/40 on `gpt-5.6-luna`, zero clear scams labelled safe), and `gpt-5.6-luna` is the **single fallback** implemented in `fallback-provider.ts`.

Bounds that did not change:

- At most **one** additional attempt per check; never a third, never a loop.
- Fallback is eligible **only** on `timeout`, `network` or `http-error` — failures where a second attempt cannot change the substance of the answer, only availability.
- **Never** after `bad-json` (truncated, unparseable or refused output) and never from `unconfigured`; retrying those would be the "retry for a more confident answer" the contract forbids.
- A failed fallback still ends in the boundary's `unavailable` state — never a verdict, never a safety conclusion.
- Spend note: a failed primary may still be billed, so one check's worst case is primary + fallback, not one cheap call.

`check-boundary.ts` and its `ProviderPort` documentation now state this explicitly; the port itself is unchanged for callers.

Also published in the same slice: the steward-aligned `persistence-port.ts` contract revision (`limitCount`, distinct-bucket enforcement, limit-enforcing reserve, `outcomeStatus`, `finalizeReconciliation`, direction-(c) deletion counts) and the async `durable-persistence.ts` **contract only** — it wraps an injected synchronous port in promises so the durable interface can be exercised today. It contains no Supabase client, no SQL, no table and no network, and nothing is applied to any database.

Verified in this branch: **597/597** tests across 49 files, `tsc --noEmit` exit 0, `eslint` exit 0. No live provider call was made for this publication, and the model comparison remains synthetic-set evidence, not an accuracy claim.

**Merged — 23 November 2026:** published as PR #54 and merged 23 Nov 13:31:51Z as `e35db9d`. Re-verified at the merged head: **605/605** tests across 49 files (two follow-up commits added the reserve/fallback-wiring tests), `tsc --noEmit`, `eslint` and `next build` exit 0, `sync-public.ts --check` clean (18 files). CI (`Shared app CI` + `M4 library tests`) success on the merged head.

## Durable usage gate — 27 November 2026

The quota gate can now count in the database instead of per process. Motivation, measured rather than
assumed: on Vercel every function instance has its own memory, so `createInMemoryUsageStore()` enforced the
monthly quota, the daily cap and the burst guard **per instance** and forgot them on a cold start
(`evidence/M4-02-live-verification-20261127.md` in the module workspace). The tables and transaction
functions were already applied and exercised; only the check path never used them.

**What changed**

- `UsagePort` may now answer asynchronously (`Awaitable<…>`) and `runCheck` awaits it. Synchronous stores are
  unchanged — the in-memory store still satisfies the contract with plain return values.
- `releaseCheck` optionally carries the terminal status (`limited` / `unavailable`) so a durable store can
  record **which** non-completed outcome released the reservation. Nothing about counting changes: only a
  completed analysis consumes quota (NFR-M4-10).
- New `durable-usage-store.ts` implements the port over `m4_reserve_check` / `m4_settle_reservation`. It
  reserves daily **and** allowance headroom before the provider call, converts exactly one reservation on
  completion, and releases on every other exit.
- The trial's first-use anchor is **continued, not restarted**: `quota.latestBucket(subject, kind)` returns
  the newest bucket of that kind, so a trial spanning a calendar-month boundary cannot be granted a fresh
  quota mid-window (review fix #7).
- `app/api/check/route.ts` passes the durable gate only when `selectPersistence` selected the durable store,
  so the memory path is unchanged when `M4_DURABLE_STORE` is unset.

**Failure policy — fail closed.** If the counting layer cannot be reached, `admitCheck` denies with a new
rejection reason `usage-unavailable` and the check does not run. Admitting without a count is how a spent
quota silently becomes unlimited, and the provider call behind it costs money. The message says the usage
could not be confirmed — it never pretends the quota was reached.

**Not claimed or not included**

- **Provider spend is still not reserved.** `m4_reserve_check` can hold budget capacity, but that needs an
  approved per-check price and X-09's written funding/cap arrangement is still open; the store passes
  `budget: null` on purpose and the service's budget port remains the labelled stub.
- **The burst guard is still per process.** The functions have no burst concept and no count query exposes
  one, so the sliding window stays in memory. It is the soft guard it always was; the monthly and daily caps
  are the ones that now hold across instances.
- **No live observation yet.** The repository suite (673 tests) and the in-memory Supabase double prove the
  reservation and settlement call shapes. Whether production buckets actually move is an owner-run
  observation: a few checks, then a read of `checker_quota_buckets` and `checker_usage_reservations`.
- **The demo identity shares one quota.** Anonymous checks run as the labelled demo subject; with durable
  counting they share its trial allowance instead of each instance having its own.

## The gate follows the verified plan — 27 November 2026

One defect was found by asking a simple product question ("can I change my own plan to keep testing?") and
reading the code instead of assuming: **the quota gate never looked at a plan.** `ui/check-service.ts` built
the entitlement port from a hardcoded demo snapshot, so every check — signed in or not — was admitted as
`local-ui-demo-subject` on the trial allowance. The route already resolved the real entitlement through M2
(`getSubscriptionContext` → `toEntitlementSnapshot`), but that object only reached the usage **event** and the
durable **row**, never the gate. Consequences, both real: a paid account spent the demo trial, and editing
`subscriptions` changed nothing about checks.

**What changed.** `CheckSubjectContext` carries the M2-verified `EntitlementSnapshot` the route gate already
accepted, and `runCheck`'s entitlement port returns it for that request. Three session states are kept apart on
purpose:

| Context | Gate result |
|---|---|
| no `Authorization` header | demo trial, byte-for-byte unchanged |
| verified snapshot | **that subject**, **that plan's allowance** |
| supplied but structurally unusable | resolves to `null` → `access-blocked` |

**The last row is the one that matters.** A malformed snapshot is never downgraded to the demo trial: a broken
session must not receive a permissive allowance. The first implementation did downgrade, and the test caught it.
Expired snapshots and unknown plan ids stay blocked through `resolveAccess`, which still invents no quota.

**No new authority.** The snapshot is the same object `gateRequestAccess` already allowed on; a request body
never reaches `context`, so a caller cannot claim a plan.

**Verified in production:** a signed-in check created its own bucket pair keyed by the user uuid
(`limit_count` 600 monthly / 40 daily), while the demo identity stayed at 15/15 — and a 24-run authenticated
battery returned 24/24 completed and persisted. **Not covered:** provider spend is still unreserved (X-09 open)
and the burst guard is still per process; both are listed as limitations in the module workspace's
`M4-KNOWN-LIMITATIONS.md`.
