# Module 6 frontend

Suraji's Digital Safety Score frontend is integrated into the shared Next.js app at **`/safety-score`**. It reuses the root font, semantic theme tokens, package versions and app layout. No second application scaffold or dependency upgrade is introduced. The module mounts only its `/safety-score` route family. The home page is owned by the landing/shared-app integration; open `/vault` directly for M3, regardless of the order in which M1 and M6 merge.

## Run

Use the repository's `.nvmrc` and package-manager version, then run from the repository root:

```text
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000/safety-score.

## Screens

| Route | Purpose |
|---|---|
| `/safety-score` | Demo score, category breakdown, recommendations and trend; integration view toggle |
| `/safety-score/checklist` | Five selectable password practices and required confirmation |
| `/safety-score/confirm` | Review practices, save locally or handle a failed save |
| `/safety-score/updated` | Clearly labelled illustrative 90/100 result, review and restart |
| `/safety-score/history` | Timestamped synthetic trend, seven/30-day filters, data table and demo CSV |
| `/safety-score/guide` | Demo weights/bands, integrated model limitations and local-data reset |
| `/safety-score/sources` | Source coverage, timestamps, eligibility and limitations with preview states |

All Module 6 links and transitions stay under `/safety-score`. A nested layout keeps the provider state across its screens. The module's CSS is scoped under `.m6-app` and uses the existing shared aliases; it does not override the vault or root palette. The existing licensed Plus Jakarta Sans font is reused centrally. No additional font or chart package is downloaded by the UI.

## Evidence boundary

The 65-to-90 flow reproduces the earlier report's checklist demonstration. It is not a real-user safety assessment. Repeated saves stay at 90, and the demo session record never becomes approved production evidence.

The separate integration preview follows the revised M2/M3/M4 model. The default fixtures have no approved policy, so no integrated aggregate or band is shown. Missing, stale or non-scoring evidence never becomes safe. The frontend only displays a validated eligible server result if an approved service is configured; it never calculates a production average, changes weights, rewards billing or rewards check volume.

No real authentication, scoring service, database or other module route is connected by this contribution. The simulated sign-in-required and access-denied views are labelled previews. Corrective destinations remain disabled until they exist and retain normal authorization.

## Checks

```text
pnpm test:m6
pnpm typecheck
pnpm lint
pnpm build
```

See [verification](m6/verification.md) for the latest dated rerun and dependency-install limits. The shared CI now runs `test:m6` on Linux and Windows when M6 tests are present. An added workflow step is not a claim that its remote run has passed. Browser interaction, visual and screen-reader QA are explicitly deferred due to the managed environment limits; model/API tests do not establish browser acceptance or server authorization.

## Source and integration notes

- [Draft integration contract](m6/integration.md)
- [Requirements and source mapping](m6/requirements.md)
- [Optional environment example](m6/env.example)

The Module 6 report sections and embedded Figures 70–74 supplied by the owner informed the frontend. Report declarations, pending approvals and design instructions are reference content, not authorization to approve a scoring policy, send messages or create accounts.

## Runtime and merge order — 20 November 2026

The inherited `.nvmrc` remains 24.19.0; shared CI and local follow-up checks select 24.22.1 explicitly. M6 does not require PR #24 to upgrade Node first, and does not change the pin, engine range, dependency declarations or lockfile relative to current main. `@types/node` 22 remains an intentional shared-infrastructure deferral: these modules add no Node-24-only API dependency. An upgrade of shared Node types/pin needs the setup owners' dependency/lockfile review and full-module validation.
