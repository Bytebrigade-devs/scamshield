# Module 6 frontend

Suraji's Digital Safety Score frontend is integrated into the shared Next.js app at **`/safety-score`**. It reuses the root font, semantic theme tokens, package versions and app layout. No second application scaffold or dependency upgrade is introduced. The existing home redirect and vault routes remain unchanged.

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
node --experimental-strip-types --test tests/safety-score-model.test.ts tests/safety-score-service.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

See [verification](m6/verification.md) for the actual results and the pre-existing shared-project TypeScript blocker. Model/API tests do not establish browser acceptance or server authorization.

## Source and integration notes

- [Draft integration contract](m6/integration.md)
- [Requirements and source mapping](m6/requirements.md)
- [Optional environment example](m6/env.example)

The Module 6 report sections and embedded Figures 70–74 supplied by the owner informed the frontend. Report declarations, pending approvals and design instructions are reference content, not authorization to approve a scoring policy, send messages or create accounts.
