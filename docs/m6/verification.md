# Module 6 verification

Latest verification: **20 November 2026**, on shared baseline `fa19c3d954a4a73d563d4119088440d2484b4284`. See the current follow-up below for the cached-dependency limitation; the 2 November results below are historical, not a validation of today's lockfile.

## Original verification — 29 October 2026

Environment: Windows, Node.js 24.18.0, Next.js 16.4.3, React 19.3.1, Tailwind CSS 4.3.3, TypeScript 5.9.3. The repository's Node/package-manager declarations and lockfile are unchanged.

| Check | Result |
|---|---|
| Module 6 model and mocked-service tests | 16 passed |
| Existing vault model regression tests | 6 passed |
| ESLint across the shared repository | Passed |
| TypeScript restricted to new M6 feature/routes/tests | Passed |
| Shared-project TypeScript | Blocked by three pre-existing M4 errors |
| Production Webpack compilation | Passed |
| Full production build | Stops at the same pre-existing M4 TypeScript errors |
| Browser interaction / visual / screen-reader QA | Not completed in this environment |

### Existing shared build blocker (original run)

`src/lib/scam-checker/check-boundary.ts`, lines 404, 435 and 441, reports TS18047: `snapshot` is possibly null. A separate TypeScript run containing **only files already tracked on the main baseline**, excluding every new M6 file, reproduced exactly these three errors. No Module 4 file is changed in this contribution. The root production build compiles successfully before stopping at that same TypeScript stage; it is not reported as a successful full build.

The scoped M6 check includes its feature files, route files and two tests against the root compiler settings. It does not disable errors in committed configuration. Temporary validation configurations are kept outside the repository and are not committed.

### Dependency setup in this execution environment

pnpm 11.25.0 could not register the project because Windows denied its store-registration symbolic link. For local validation only, the declared top-level dependencies were installed with npm using their versions from the committed pnpm lockfile, with install scripts and package-lock generation disabled. The root package manifest, pnpm workspace configuration and pnpm lockfile are unchanged. This records a tooling limitation; it does not claim a completed frozen pnpm installation or an identical transitive installation.

### What the tests establish

Required practices; exact illustrative score transitions and band boundaries; safe restoration of fixed practice IDs; malformed/future-dated records; write-before-save-success behaviour; strict source schema and private/unknown field rejection; stale/missing evidence handling; suppression of totals for unapproved policies or ineligible sources; display rather than recalculation of eligible test totals; no reward for additional checks; restricted same-origin API paths; chronological history; and mocked API authorization/network/format failures.

The approved-policy response in tests is an isolated test fixture, not a real team-approved scoring model. The default preview never displays that fixture as real data.

### Remaining manual acceptance (original run)

- Complete checklist validation, back/review/cancel, save, refresh restoration, failure/retry, explicit unsaved preview and reset in a browser.
- Confirm Overview, History and Guide highlight correctly and every M6 transition remains within `/safety-score`.
- Exercise all integration preview states and source-detail disclosure; check timestamp freshness and no invented total/band.
- Check chart/table/CSV consistency and seven/30-day filters.
- Check keyboard focus, root skip link, labels, error announcements and screen-reader reading order.
- Review desktop/mobile layouts, 200% zoom, reduced motion and overflow. Inspect the existing vault after visiting M6 to verify CSS isolation in a real browser.
- Validate authentication, per-user access, approved producer contracts, scoring policy and authorized corrective actions with owning modules before any production integration claim.

Browser QA is not substituted by another browser-control method; the earlier local preview and current-URL verification limitations remain. No production, dark-mode or usability acceptance is claimed.

## Review follow-up — 2 November 2026

Addresses [review 5697902222 on PR #25](https://github.com/Bytebrigade-devs/scamshield/pull/25#pullrequestreview-5697902222). Verification was rerun on **Node.js 24.22.1**, using the official Windows executable verified against Node.js's published SHA-256 checksum. Package versions remain Next.js 16.4.3, React 19.3.1, TypeScript 5.9.3, ESLint 9.39.5 and Tailwind 4.3.3. The existing npm-fallback dependency tree was reused; the exact fallback note above still applies. No completed frozen pnpm installation or identical transitive tree is claimed, and no dependency or lockfile change is introduced.

### Current results

| Check on Node 24.22.1 | Result |
| --- | --- |
| Module 6 model and mocked-service tests | **16 passed**, 0 failures |
| Scoped M6 TypeScript check | **Passed** |
| Full shared-project TypeScript check | **Passed** after syncing the M4 owner's merged fix |
| ESLint across the shared repository | **Passed**, no errors or warnings |
| Full production Webpack build | **Passed**, including type checking, page generation and build traces |
| M6 production routes | All seven routes generated under `/safety-score`; vault route retained |
| Whitespace check against main | **Passed** |
| Browser interaction, visual and screen-reader acceptance | **Explicitly deferred**, details below |

The first rerun on the old branch reproduced the previously recorded M4 TS18047 errors. Meanwhile, the M4 owner resolved them in PR #26, merged into main as `c66e6b871996f34a4498f9172a392a5a9754ae63`. That main commit was merged into this feature branch; the full typecheck and build then passed. `src/lib/scam-checker/check-boundary.ts` exactly matches main. No independent M4 edit, error suppression or build-check override was made by M6. The old build-blocker entry above is historical, not the current result.

Commands used, with `node` explicitly pointing to the verified **24.22.1** executable:

```sh
node --version
node --experimental-strip-types --test tests/safety-score-model.test.ts tests/safety-score-service.test.ts
node node_modules/typescript/bin/tsc --project /path/to/temporary-m6-only-check.json --noEmit
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build --webpack
git diff --check origin/main
```

The temporary scoped-check config is outside the repository. It extends the root compiler options and includes `src/features/safety-score/**/*`, `src/app/safety-score/**/*` and `tests/safety-score-*.test.ts`, with the repository's installed type roots. It does not alter or weaken the committed configuration. The full root typecheck and full build also passed; the scoped result is not used to conceal another module's errors.

### Browser QA decision: explicitly deferred

**Outcome on 2 November 2026: browser QA is deferred, not passed.** The managed session has unresolved browser-access/current-URL verification limits. A local loopback HTTP check during the M1 follow-up in this same workspace also timed out. No new browser interaction or screen-reader run was completed for this M6 follow-up, and no alternate browser-control route was used to bypass those limits. The reviewer explicitly permits a recorded deferral. Compiled pages, model tests and lint do not establish usability or accessibility acceptance.

| Manual acceptance area | Recorded outcome |
| --- | --- |
| Checklist validation, Back/review/cancel, save/restore, failed save/retry, unsaved preview and reset | **Deferred** to a normal browser environment |
| All navigation/transitions staying under `/safety-score` and correct active navigation | **Deferred**; production route generation passed, interactive transitions not verified |
| Source preview states, timestamps, eligibility and suppression of invented totals/bands | **Deferred** for UI acceptance; model/service behavior covered by the passing tests |
| Chart/table/CSV consistency and seven/30-day filtering | **Deferred** for browser acceptance |
| Keyboard focus, root skip link, labels, errors and screen-reader reading order | **Deferred**; no keyboard or screen-reader pass claimed |
| Desktop/mobile, 200% zoom, reduced motion, overflow and CSS isolation after visiting the vault | **Deferred**; no rendered-layout or dark-mode acceptance claimed |
| Real authentication, per-user access, approved scoring/producer contracts and authorized corrective actions | **Not implemented / outside frontend preview acceptance**; requires owning-module integration |

Run the listed checks in an unrestricted team browser before claiming browser, visual, accessibility or production acceptance. This is an explicit environment-based deferral; it is not a claim that those requirements have passed.

### PR description

The accompanying PR #25 description records scope, evidence boundaries, Node 24.22.1 results, the inherited M4 fix, the retained npm-fallback limitation and this browser QA deferral. No new scoring formula, backend behavior, event delivery or dependency is introduced by the review follow-up.

## Round 2 follow-up — 20 November 2026

Review: [PR #25 round 2](https://github.com/Bytebrigade-devs/scamshield/pull/25#issuecomment-6893766210).

## Environment and reproducibility limit

Node **24.22.1** on Windows was selected explicitly, matching shared CI. The inherited `.nvmrc` stays **24.19.0**, the root engine range stays `>=22.13.0`, and pnpm stays 11.25.0. Neither module changes shared dependency declarations or `pnpm-lock.yaml` relative to main. No PR #24 pin-upgrade dependency remains. `@types/node` stays on the shared 22 baseline deliberately: these frontend changes require no Node-24-only APIs. A Node-types/pin upgrade belongs to a separate owner-reviewed setup change with a full shared rerun, not this frontend PR.

**The current lockfile environment has not been reproduced locally.** The managed Windows pnpm store-registration symlink remains denied (`EPERM`), as in the previous records. In addition, shared main now declares/locks Next **16.4.6**; an attempted local installation returned npm `ETARGET`, “No matching version found for next@16.4.6”. The existing fallback dependency tree uses Next **16.4.3**, React 19.3.1, TypeScript 5.9.3, ESLint 9.39.5 and Tailwind 4.3.3. The results below are observations against that cached tree, not proof of the current frozen lockfile or identical transitive dependencies. No npm lockfile, machine-specific workaround, dependency downgrade or disabled build check is committed.

The shared CI remains responsible for `pnpm install --frozen-lockfile` plus lint, typecheck, build and model tests against the committed lockfile on Linux and Windows. A new workflow step is not an observed remote pass. If the normal team environment also cannot resolve main's Next version, the shared setup owner must resolve that dependency declaration/lockfile; these module PRs do not silently replace it.

### Current observed results

| Check | Result |
| --- | --- |
| M6 model and mocked-service suite | **18 passed** |
| Combined M4 recursive library, vault and M6 suites | **561 passed**, none failed/skipped |
| Full repository lint | **Passed**, no errors/warnings |
| Full shared TypeScript | **Passed** |
| Full Webpack production build | **Passed on cached Next 16.4.3**, including all seven `/safety-score` pages, inherited vault/checker/API routes |
| Shared pin/engines/dependencies/lockfile comparison | Unchanged relative to main; only `test:m6` added to manifest |
| Git whitespace check | Passed |
| Browser/visual/keyboard/screen-reader acceptance | **Deferred; no pass claimed** |

The M3 boundary now uses all five Appendix C.2 count names including `assessedLoginCount`, requires a complete bounded count set and rejects partial/invalid data. The M4 boundary retains the exact seven-field draft payload, validated by its existing library validator; invented check-count metrics are rejected. Tests cover both changes. The wrapper mapping is documented in `integration.md`, without claiming consumer approval, a final account-security exporter, approved freshness or scoring policy.

`pnpm test:m6` is now available and shared app CI conditionally runs it on Linux and Windows. Both modules use identical conditional workflow additions so their merge order does not require competing workflow edits. No observed remote CI result is claimed here.

Build details: the first attempt compiled/typechecked/generated the pages, then exited with a security alert for cached Next 16.4.3. A retry exposed an `EPERM` in the old generated `.next` directory. That generated cache was moved outside the checkout, and a clean build passed without disabling any checks. The security upgrade reminder persisted. Upgrade the cached framework before deployment; this passing build does not clear the advisory or establish the current lockfile environment.

### Dated browser and consumer-review plan

Proposed owner-run acceptance slot: **21 November 2026, before merge**. Suraji should run the seven-screen journey in a normal team browser and record results: checklist validation/back/cancel/save/refresh/reset and failures; every navigation transition; all source preview states/details; timestamps/aggregate suppression; chart/table/filter/CSV consistency; keyboard/skip-link/focus/labels; screen-reader order; desktop/mobile/dark/200% zoom/reduced motion; CSS isolation with vault/checker. Confirmation of the slot and completed evidence remain owed. No session is booked by this document, and the deferred checks above remain open until results exist.

M6-09 remains pending: written yes/no/changes on M4's scam-activity input, guidance/destinations, and compatibility of both supplied design inputs. Code-level field alignment does not sign off those design inputs or approve a numeric formula. M4 evidence is non-scoring in every default fixture. No live summary endpoint, subject isolation test, database, production history, provider processing, or corrective-action completion is implemented by this PR.
