# M4 — checker UI serving layer

**Published:** 18 November 2026 (workspace sync; **mounted** the same day by PR #39) · **Scope:** the M4 checker's serving layer and browser assets, now inside `src/lib/scam-checker/ui/`, plus the live `/checker` page and API routes.
**Not in scope:** no real entitlement (demo rules-only mode), no live provider call, no deployment, no accuracy claim.

## Current state — 24 November 2026 (supersedes the serving details below)

`/checker` is now a **React page**, not a Route Handler: `src/app/checker/page.tsx` + `src/app/checker/layout.tsx` + `src/features/checker/**`, on Next.js 16 App Router / React 19. The screen imports the pure view models from `ui/public/*.js` (`assessment`, `evidence`, `guidance`, `summary`, `render-safe`, plus `linkWarningModel`, `feedbackModel`, `reviewedSource`, `aiFailureMessage`) and `ui/public/styles.css`; it does not load any script from `/checker/*`.

Consequences for the statements on this page:

- **`src/app/checker/shell.generated.ts` no longer exists** and `src/app/checker/route.ts` was deleted. The HTML shell is not generated anywhere.
- **`public/checker/` now holds only `favicon.svg`.** The 14 browser modules are no longer copied there; they would be dead assets.
- **`ui/scripts/sync-public.ts` produces 3 files, not 18** — the two woff2 fonts and the favicon — because those are the only things a stylesheet or the route metadata must fetch by absolute URL. `public-mirror.test.ts` asserts the new set.
- **`ui/public/app.js`, `guidance-cards.js`, `summary-card.js` and `index.html` are no longer imported by the app.** They remain the workspace's frozen vanilla demo (see `code/ui/` in the owner workspace) and still run the Netlify demo deployment; they are not part of the Next.js page.
- **`ui/server.ts` and `ui/netlify-handler.ts` were deleted (24 November 2026, later that day)** along with the workspace `netlify/` + `netlify.toml` that served them. Their transport logic survives as the framework-neutral `ui/check-route.ts` (`createCheckRoute`), which `src/app/api/check/route.ts` now wraps and which the service tests call directly — the same admission rules, one implementation, no second server. The Netlify demo deployment is retired in favour of the Vercel deployment of this app.

Every dated paragraph below keeps its original meaning as a snapshot of that day. [Port record: `evidence/M4-checker-react-port-20261124.md` in the owner workspace.]

## Why this exists

Until this sync the repository carried M4's libraries (boundary, rules, preprocessing, taxonomy, history/feedback stores, link-warning view model) but not the layer that turns them into a working check: provider transport, guidance and organization data, link inspection, summary rendering, and the static screens. The workspace build had all of it; the repository did not. This slice closes that gap so the app can mount it.

## What was added

| Module | Role |
|---|---|
| `ui/check-service.ts` | Orchestrates a check: live-config detection, provider call, rules-only fallback, evidence/guidance/organization/link assembly. Injected options only; no ambient authority. |
| `ui/responses-adapter.ts` | OpenAI Responses-API transport with bounded failure codes. Never retries, never falls back to another model. |
| `ui/server.ts` | Local Node `http` server that serves `ui/public/` and the check endpoint. Used by tests and the workspace demo; this is **not** the production surface. |
| `ui/netlify-handler.ts` | Netlify Functions adapter over the same service. |
| `ui/guidance-directory.ts`, `ui/guidance-service.ts` | Reviewed official guidance records with source/date/scope, plus the selection service. |
| `ui/organization-directory.ts`, `ui/organization-verification.ts` | Reviewed organization domains/contacts and the offline verification used to separate message contacts from official reference contacts. |
| `ui/link-inspection.ts` | Offline hostname comparison: IDNA folding, IP/credential rejection, no HTTP, no DNS, no redirects, no reputation. |
| `ui/link-warning.ts` | Warning-banner view model (moved here; it was published flat earlier). |
| `ui/sender-verification.ts` | Sender/identity metadata comparison, offline. |
| `ui/summary.ts`-equivalent browser code | Copy/TXT/print summary model lives in `ui/public/summary.js` with a strict field allowlist. |
| `ui/render-safe.ts`-equivalent browser code | `ui/public/render-safe.js` neutralises markup/bidi without changing lengths. |
| `ui/public/*` | The 13 browser assets (HTML, CSS, JS, favicon, fonts) the screens need. |
| `ui/vendor/unicode-18.0.0/` | Pinned Unicode data (`confusables.txt`, `Scripts.txt`, licence) with its generator in `ui/scripts`. |

The layer arrives with its tests, including the cross-tree drift guard `ui/reviewed-reference.test.ts`, which compares the rule engine's reviewed projection against the reviewed organization directory.

## Layout change (18 November 2026)

`src/lib/scam-checker` is now a mirrored tree — `preprocess/`, `rules/`, `boundary/`, `ui/`, `testing/` — instead of a flat folder, matching the owner workspace so files port byte-identically. The CI command is therefore recursive:

```powershell
node --test "src/lib/scam-checker/**/*.test.ts"
```

The one fixture the published tests read (`M4-result-regression.json`) lives at `src/lib/testing/`. The frozen 52-pair/104-message sweep fixture and the 500-message set remain workspace-only by policy.

## What this slice deliberately does not do

- **No provider call.** `live-smoke.ts` is not published; it reads `.env.local` and performs a real call. Nothing here reads the environment except the explicit server-side config factory.
- **Mounted 18 November 2026 (PR #39).** `/checker` serves the screen and `/api/check` + `/api/config` are live routes; see [docs/m4-checker-mount notes in the mount record] and the routes under `src/app/`. The assets under `public/checker/` are generated by `ui/scripts/sync-public.ts` and pinned by a drift test.
- **Demo entitlement only.** The mounted service runs a clearly labelled rules-only demo mode with no provider, until M2's `getSubscriptionContext` lands on `main`. No account, no server-side history, no live AI call.
- **No claims.** Local tests are regression evidence, not accuracy, coverage or production evidence. Tamil remains unsupported; Sinhala/Singlish cues carry no accuracy claim.

## Verification

```powershell
node --test "src/lib/scam-checker/**/*.test.ts"   # 473 passing in the sync branch
corepack pnpm typecheck                           # tsc --noEmit, exit 0
corepack pnpm build                               # app build, exit 0
```

`tsconfig.json` excludes `src/lib/scam-checker/**/*.test.ts` from `tsc`: several UI tests import untyped browser JS from `ui/public/`, so they are executed by `node --test` (CI) rather than typechecked. Product code is fully typechecked.

The workspace suite that produced these files passes 464/464 (including the six sweep tests that stay workspace-only); the repository run adds the two repository-only drift guards.

## 23 November 2026 — model policy, 28-organization directory and UI sync

Closes the drift recorded in the 23 November workspace sync: the repository was behind the workspace on the serving layer, the reviewed directory and the model policy.

| Area | Change |
|---|---|
| Model policy | `check-service.ts`, `server.ts` and `netlify-handler.ts` wire the **`gpt-6-luna` primary + one bounded `gpt-5.6-luna` transport-failure fallback** (`boundary/fallback-provider.ts`), and both server surfaces report `fallbackModel` in `/api/config`. |
| Reviewed directory | `organization-directory.ts` expands the reviewed set from 13 to **28 organizations** (telecom/utility/bank/government, commerce & courier, global platforms), and `rules/reviewed-reference.ts` carries the matching reviewed projection so the cross-tree drift guard still passes. Every record cites the organization's own official page; unreachable sources stayed omitted, not guessed. |
| Guidance | `guidance-directory.ts` gains the Seylan Bank and National Savings Bank records added on 20 November (source, date, scope, no fraud-hotline claim). |
| UI | `ui/public/` carries the result-page refinements: a visible check-progress indicator, explanation clamping on every width with a keyboard-operable expand control, and evidence reasons rendered as a list. The served copy under `public/checker/` and `src/app/checker/shell.generated.ts` are regenerated by `ui/scripts/sync-public.ts` (**18 files**), so the mirror drift test passes. |
| Durable contract | `boundary/durable-persistence.ts` (+ test) publishes the async persistence **contract** only — a promise wrapper over an injected synchronous port. No Supabase client, no SQL, no table, no network. `persistence-port.ts` is revised to the steward-aligned contract. |

**Verified:** repository suite **597/597** across 49 files (was 569/47), `tsc --noEmit` exit 0, `eslint` exit 0, and `sync-public.ts` regenerated without drift.

**Merged — 23 November 2026:** published as PR #54 and merged 23 Nov 13:31:51Z as `e35db9d`; re-verified at the merged head **605/605** across 49 files, `tsc`/`eslint`/`next build` exit 0, `sync-public.ts --check` clean, CI success on both workflows.

**Not claimed:** no live provider call in this publication, no accuracy or coverage claim, no database object or migration applied, no deployment, and no change to the demo notice text beyond what the 22 November notice PR already merged.
