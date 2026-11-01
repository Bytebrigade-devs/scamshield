# Module 1 review follow-up verification

Review: [PR #24, review 5697756651](https://github.com/Bytebrigade-devs/scamshield/pull/24#pullrequestreview-5697756651).

## Environment

Checks below used Node.js **24.22.1** on Windows, Next.js 16.4.3, React 19.3.1, TypeScript 5.9.3, ESLint 9.39.5 and Tailwind 4.3.3. The Node executable was downloaded from the official Node.js release and verified against its published SHA-256 checksum. `.nvmrc` and the root Node engine now select the requested shared Node 24 baseline. The repository continues to declare pnpm 11.25.0 and retains main's single `pnpm-lock.yaml` unchanged.

`pnpm install --frozen-lockfile --ignore-scripts` with a local store, hoisted linking and copy imports could not complete: Windows denied pnpm's project-registration symlink (`EPERM`). The existing local dependency tree used for M6 verification was copied for these checks. Its top-level packages match the root lockfile versions, but it was originally installed via npm without saving a manifest or lockfile. **This is not a successful frozen pnpm installation or proof of an identical transitive tree.** No npm lockfile or machine-specific install configuration is committed. Re-run `pnpm install --frozen-lockfile` in the team's normal environment before merge.

## Results on Node 24.22.1

| Check | Result |
| --- | --- |
| M1 model and event tests | **11 passed** |
| Existing M3 vault model tests | **6 passed** |
| Full repository ESLint | **Passed**, 42 source/config/test files, no errors or warnings |
| M1 routes, features and tests TypeScript check | **Passed**, using the root compiler options |
| Full root TypeScript check | **Blocked by 3 existing M4 errors**, below |
| Production Webpack compilation | **Passed**, including all six M1 routes and the vault route |
| Full production build | **Blocked during TypeScript**, same existing M4 errors |
| CSS scope check | All M1 selectors scoped to `.m1-app`; no font, theme or Tailwind import duplicated |
| Route manifest | Landing, onboarding, benefits, share, privacy, signup-preview and vault compiled |
| Whitespace check against main | Passed |
| Browser interaction / visual acceptance | **Not completed** |

The local development server started successfully. A read-only HTTP route smoke check timed out connecting to loopback in this managed session, so route responses, navigation, keyboard interactions, responsive layout and rendered dark mode are not claimed as verified. No browser-access workaround was used. The compiled manifest check does not substitute for browser testing.

Commands used after the dependency setup (each `node` invocation used the verified 24.22.1 executable):

```sh
node --experimental-strip-types --test tests/landing-model.test.ts tests/landing-events.test.ts tests/vault-model.test.ts
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
```

The M1-only TypeScript check used a temporary config outside the repository, extending the root `tsconfig.json` and selecting the M1 routes, feature files, tests and Next declarations. A second temporary config selected only unchanged tracked main files, reproducing exactly the same three errors as the full check. Neither temporary config is an application build override; build type checking remains enabled.

## Existing shared-build blocker

Baseline main: `1f776562a8319479424cabaec0b9d8caf2beca31`.

`src/lib/scam-checker/check-boundary.ts` has TS18047, “snapshot is possibly null”, at lines **404**, **435** and **441**. That file is byte-for-byte unchanged from main in this contribution. The unchanged-main-only check reproduced all three errors. No error suppression, type-safety relaxation or M4 behavior edit was added. The M4 owner must resolve the blocker before the shared production build can pass.

## Review findings addressed

- M1 now uses the shared `src/` application; the separate app, manifest, npm lockfile, config, font copy, generated-export tools and Windows launchers were removed. No standalone exception is needed.
- Main was merged into the feature branch, retaining the full M3 README section and adding M1 instructions alongside it. The M3 entry remains `/vault`; its historical validation record is unchanged.
- Validation was repeated on the requested Node 24.22.1, with failures and environment limits recorded here.
- Cross-platform pnpm instructions replace Windows-only launchers.
- Draft events, experiments and M2 handoff remain disabled/unconnected pending the owning modules' X-02 agreement. No M5 delivery was implemented.

PR #24's description accompanies this correction with scope, validation and remaining integration limits. No review approval or merge readiness is implied by a successful push.
