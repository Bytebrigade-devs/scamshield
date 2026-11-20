# Module 1 verification — 20 November 2026

Follow-up to [PR #24 round 2](https://github.com/Bytebrigade-devs/scamshield/pull/24#issuecomment-6893765557). Shared baseline merged: `fa19c3d954a4a73d563d4119088440d2484b4284`.

## Environment and reproducibility limit

Node **24.22.1** on Windows was selected explicitly, matching shared CI. The inherited `.nvmrc` stays **24.19.0**, the root engine range stays `>=22.13.0`, and pnpm stays 11.25.0. Neither module changes shared dependency declarations or `pnpm-lock.yaml` relative to main. No PR #24 pin-upgrade dependency remains. `@types/node` stays on the shared 22 baseline deliberately: these frontend changes require no Node-24-only APIs. A Node-types/pin upgrade belongs to a separate owner-reviewed setup change with a full shared rerun, not this frontend PR.

**The current lockfile environment has not been reproduced locally.** The managed Windows pnpm store-registration symlink remains denied (`EPERM`), as in the previous records. In addition, shared main now declares/locks Next **16.4.6**; an attempted local installation returned npm `ETARGET`, “No matching version found for next@16.4.6”. The existing fallback dependency tree uses Next **16.4.3**, React 19.3.1, TypeScript 5.9.3, ESLint 9.39.5 and Tailwind 4.3.3. The results below are observations against that cached tree, not proof of the current frozen lockfile or identical transitive dependencies. No npm lockfile, machine-specific workaround, dependency downgrade or disabled build check is committed.

The shared CI remains responsible for `pnpm install --frozen-lockfile` plus lint, typecheck, build and model tests against the committed lockfile on Linux and Windows. A new workflow step is not an observed remote pass. If the normal team environment also cannot resolve main's Next version, the shared setup owner must resolve that dependency declaration/lockfile; these module PRs do not silently replace it.

The cached Next 16.4.3 also reported a known-security-vulnerability alert during the M6 build in the same environment. It should be upgraded rather than used for deployment. A successful local compilation does not clear that advisory or validate the unresolved current-main dependency installation.

## Observed results

| Check | Result |
| --- | --- |
| M1 model/event tests | **12 passed** (including exit-reminder eligibility) |
| Existing M3 vault model tests | **6 passed** |
| Full repository ESLint | **Passed**, no warnings/errors |
| Full shared TypeScript | **Passed** |
| Full Webpack production build | **Passed on cached Next 16.4.3**, including all six M1 pages, `/vault`, `/checker` and inherited API routes |
| Manifest/engine/pin/lockfile compared with main | Only the `test:m1` script differs in the manifest; pin, engines, dependencies and lockfile match main |
| Git whitespace check | Passed |
| Browser, visual, keyboard and screen-reader acceptance | **Not run; deferred**, see below |

Commands used, each `node` invocation explicitly using 24.22.1:

```sh
node --experimental-strip-types --test tests/landing-model.test.ts tests/landing-events.test.ts tests/vault-model.test.ts
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
git diff --check origin/main
```

The old 29 October TS18047 blocker at `check-boundary.ts` 404/435/441 is **resolved by the M4 owner's changes on main**. It is not a current failure. The prior record is available in commit `873f669`; no M4 source is edited by M1.

## Scope and acceptance still owed

- The shared Node pin/engine changes from the first M1 correction are withdrawn. M3's historical records remain historical; M1 reran its six model tests and the shared static/build checks only. No full M3 Edge/browser rerun or setup-owner approval is claimed.
- Partial onboarding now has a native desktop exit reminder, shown at most once per mounted marketing-provider visit; storage-error/completed/empty journeys do not trigger it. An eligibility model regression passes. `tests/browser/landing-exit.spec.ts` adds the partial/empty/dismiss-once browser regression, **but it has not been executed**.
- Landing project provenance and source/privacy links replace any need for invented testimonial claims. M1-06 analytics delivery is **blocked on X-02**; local events, referral and experiment prototypes do not count as backend delivery.
- Browser acceptance is explicitly deferred because the managed session's browser/current-URL and loopback restrictions remain unresolved. No alternate browser-control path was used. Proposed owner-run slot: **21 November 2026, before merge**; confirmation and results are still owed. Run the new exit-reminder test plus the M1 journey in a normal desktop browser; check Escape/focus restoration, touch exclusion, saved-progress behavior, 200% zoom, mobile/dark rendering and CSS isolation with `/vault` and `/checker`. This is an acceptance plan, not a completed review or booking.

CI now conditionally runs M1 and M6 model suites when their files are present. Remote CI results and a successful frozen installation must be reviewed before describing this as fully verified on the current shared lockfile.
