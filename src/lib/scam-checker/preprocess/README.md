# M4-03 — Stage 1 preprocessing (WIP slice)

**Offline LK phone-shape classification — 15 November 2026 (Tier-0; no AI, key or network):** `extractCandidates` now adds an optional `phoneInsights[]` note for each accepted phone candidate, classifying **shape only** against vendored, pinned Sri Lankan numbering metadata (`libphonenumber-js` 1.12.10 metadata, MIT; artifact SHA-256 recorded). `normaliseLkPhone` reads `0XXXXXXXXX`, `+94…`, `0094…`, bare 9-digit and bare `94…` forms as E.164; `classifyPhone` reports `{ raw, e164, lkNumber, lkMobile }`. Raw candidates are never rewritten, and the plain `{ urls, emails, phones }` shape is unchanged when no phone exists. **Limits:** shape only — never an allocation, reachability, subscriber or operator claim; mobile number portability is not queried; other countries stay unclassified, never "invalid" or "safe". No network, no new npm dependency; the reviewed source is `vendor/lk-phonenumber-metadata.json` + generated `lk-phone-metadata.generated.ts`, and the former zero-imports pin is now a pinned local-import allow-list covering the whole chain. **34/34 preprocessing + 6/6 phone-metadata tests**; strict sweep unchanged **103/103**. [Evidence](../../evidence/M4-phone-metadata-20261115.md).

**Current implementation reconciliation — 27 October 2026:** The deployed UI service reuses this extractor and adds a separate reviewed-contact verifier with its own full-address tokenizer. This does not change the extractor’s candidate-only/no-network contract or its conservative wrapped readings. Overall suite: 229 tests (147 library/boundary + 6 sweep + 76 UI, re-verified 27 October after the hardening sync); no new preprocessing accuracy or language claim. [Current implementation, API and demo guide](../../report/M4-current-implementation-status-20261027.md). Earlier dated sections retain their snapshot scope.

**Recheck follow-up — 24 October 2026 (current workspace behavior):** optional `wrappedCandidates` readings now require explicit URL syntax in the continuation, and never absorb independent URLs, email addresses or phone candidates. Plain words/numbers remain split even after a trailing slash or hyphen: `winner-` followed by `list` is deliberately ambiguous; `winner-` followed by `list?ref=1` can produce a disclosed reading. `urls` remains verbatim throughout. **31/31 preprocessing tests; 132/132 full-suite tests.** This narrows the earlier same-day joining description below; those older totals describe historical snapshots. [Follow-up evidence](../../evidence/M4-review-followup-fixes-20261024.md).

**Review fix #4 — 24 October 2026 (workspace-only):** `urls` now contains **only verbatim substrings** of the submitted text. A line-wrapped URL is reported as its verbatim first-line fragment, while the stitched full reading (newline removed — not a substring) is disclosed **only** via the optional `wrappedCandidates` note, never posing as a raw span. A trailing sentence period before a break no longer joins (a genuine TLD-dot wrap still joins from the continuation side). **28/28 preprocessing tests pass**, including a pin that every reported `url` is a substring and every stitched reading is not. [Review-response record](../../evidence/M4-review-response-20261024.md).

**v0.2 line-wrap stitching — 24 October 2026 (workspace-only; M4-15 partial):** `extractCandidates` stitches URL candidates split by a single line break (SMS line-wrapping), conservatively: the join is accepted only when the pre-break line ends mid-token or the next line starts with a URL separator/digit, and the joined value must still validate. Word-like continuations (`example.com` followed by `Next sentence…`) and following separate URLs are never glued; an unstitched alphanumeric wrap keeps the verbatim first-line fragment. The stitched reading is disclosed via the **optional** `wrappedCandidates` note field (present only when non-empty — the plain `{ urls, emails, phones }` shape is unchanged). [Slice record](../../evidence/M4-local-rules-adaptation-20261024.md).

**Publication follow-up — 24 October 2026:** the refined implementation and 21 preprocessing tests are now committed in `scamshield`, alongside the rule refinements and their tests: `defa2b3`, [PR #17](https://github.com/Bytebrigade-devs/scamshield/pull/17) — **MERGED to `main` 24 Oct (merge commit `4af3a8a`)**, **52/52 repository tests pass**. PR #13 was verified merged on 22 October; older awaiting-merge/unpublished notes below describe the earlier stages. No further merge or provider operation pending. *The v0.2 stitching above is workspace-only and not yet in the repository.*

**Refinements — 24 October 2026:** uppercase HTTP/HTTPS/www prefixes now extract without changing their spelling. Adjacent phone candidates separated by spaces, tabs or line breaks are retained, including a formatted second number; continuous over-long runs are still rejected whole. **21/21 preprocessing tests pass**. The refinements and PR #13 review responses F1–F4 are on `main` via [PR #17](https://github.com/Bytebrigade-devs/scamshield/pull/17), merged 24 Oct from `fix/m4-analysis-refinements`. F5 remains deferred to result-rendering safeguards. The dated PR history below is preserved; [current verification](../../evidence/M4-code-refinements-20261024.md) and [rule/evaluation notes](../rules/README.md) describe the refined code.

**Current status — 24 October 2026:** [PR #13](https://github.com/Bytebrigade-devs/scamshield/pull/13) **MERGED on 22 October** (`feat/m4-03-preprocessing`, original commit `960b37e`, 12 original tests). The later refinements and F1–F4 review responses landed via [PR #17](https://github.com/Bytebrigade-devs/scamshield/pull/17), **MERGED to `main` on 24 October** (merge commit `4af3a8a`, branch `fix/m4-analysis-refinements`); current preprocessing tests 21/21, repository suite 52/52. No new task-completion or rendering-safety acceptance is implied; F5 is still deferred.

- `preprocess.ts` — `extractCandidates(text)` → `{ urls, emails, phones }` plus the optional `wrappedCandidates` and `phoneInsights` notes (untrusted candidates, FR-M4-02). Pure string processing: **no network I/O**, no fetch, no destination lookup.
- `phone-metadata.ts` — offline Sri Lankan phone **shape** normalisation/classification (`normaliseLkPhone`, `classifyPhone`); imports only the generated metadata, performs no I/O. 15 November 2026.
- `lk-phone-metadata.generated.ts` — generated from `vendor/lk-phonenumber-metadata.json` by `scripts/generate-lk-phone-metadata.ts` (SHA-256-pinned, `--check` reproducible). **Do not hand-edit.**
- `vendor/lk-phonenumber-metadata.json` — reviewed, vendored LK numbering facts + provenance (source, version, licence, artifact SHA-256, limits). Refreshing it is a reviewed decision.
- `phone-metadata.test.ts` — 6 tests pinning normalisation forms, unclassified behaviour, no-network construction, additive extraction integration and the pinned source identity.
- `preprocess.test.ts` — 34 current workspace tests pinned to FR-M4-02 / FS-M4-02 / FS-M4-04, including the expected-set and no-candidate cases, a fixture-grounded case (synthetic pair `M4-PH06-S`), the PR #13 review round (F1–F4) and the pinned local-import allow-list (15 Nov 2026).

## Run the tests (zero dependencies)

```
node --test code/preprocess/preprocess.test.ts
```

Requires Node ≥ 22.18 (native TypeScript type stripping). Verified on this machine: **Node v24.22.0, 19/19 pass** (22 Oct 2026).

## X-06 / M4-19 note (PROPOSED, not confirmed)

This zero-dependency setup (`node --test` + type stripping) is M4's **proposed** starting test convention pending team confirmation of the X-06 harness. If the team standardizes on another runner (e.g. Vitest under the Next.js scaffold), the tests port mechanically — they only use `node:test` and `node:assert/strict`.

## Boundaries

- Candidates are **untrusted identifiers, not verified identities**; extraction proves nothing about legitimacy (FR-M4-02/FR-M4-03).
- No input capping here — over-cap rejection is FR-M4-01 server-side validation; no truncation is done at this stage (FS-M4-02).
- No language detection or capability claim; Unicode always preserved (FS-M4-04).
- **Carried forward (PR #13 review, F5 — for the M4-05/M4-07 result stage, NFR-M4-04):** bidi/control characters (e.g. U+202C) survive into candidates verbatim; any display of a candidate URL/identifier must show a normalized/escaped form. Candidates are data, not trusted evidence.

## PR #13 review round — F1–F5 addressed in workspace (22 October 2026)

The [review response](../../evidence/M4-pr13-review-response-20261022.md) maps each finding to its fix: F1 no-fetch acceptance test (+ zero-imports pin), F2 balance-aware trailing-closer trim, F3 not-after-digit `+` guard with an accurate two-layer comment, F4 over-long digit runs pinned as dropped-whole (no carved sub-span), F5 carried forward. **19/19 tests pass; nothing pushed — the PR branch still holds `960b37e` (12 tests) until the owner gives the go.**

## PR opened (22 October 2026 — the description below was used for [PR #13](https://github.com/Bytebrigade-devs/scamshield/pull/13))

> **M4-03: Stage 1 preprocessing — candidate extraction with unit tests**
>
> Adds `src/lib/scam-checker/preprocess.ts` (extract URLs / emails / phone candidates from pasted text; no network I/O; untrusted candidates per FR-M4-02) and `preprocess.test.ts` (12 tests: expected sets, no-candidate text, empty/garbage, Unicode/FS-M4-04, URL>email>phone non-overlap precedence, dedupe, no-truncation, fixture-grounded pair M4-PH06-S). Runner: `node --test` (zero dependencies) — proposed X-06 convention pending team confirmation. Tests: 12/12 pass locally (Node v24.22.0).
>
> Branch: `feat/m4-03-preprocessing` → `main`. References M4 task M4-03 / FR-M4-02.

Placement decision when landing: inside `src/lib/scam-checker/` of the app scaffold if `feat/m2-signup-paywall` has merged by then; otherwise the same folder standalone, moved mechanically after the merge (X-10 conventions apply).
