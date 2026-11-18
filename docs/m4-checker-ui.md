# M4 — checker UI serving layer

**Published:** 18 November 2026 (workspace sync) · **Scope:** the M4 checker's serving layer and browser assets, now inside `src/lib/scam-checker/ui/`.
**Not in scope:** no route or page is mounted in the Next app yet, no live provider call, no deployment, no accuracy claim.

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
- **No mounted UI.** There is no `src/app/checker` page and no API route yet; that is the next slice. Until then the layer is test-proven but not user-reachable in the app.
- **No entitlement source.** The route slice will run a clearly labelled demo/rules-only mode until M2's `getSubscriptionContext` lands on `main`.
- **No claims.** Local tests are regression evidence, not accuracy, coverage or production evidence. Tamil remains unsupported; Sinhala/Singlish cues carry no accuracy claim.

## Verification

```powershell
node --test "src/lib/scam-checker/**/*.test.ts"   # 473 passing in the sync branch
corepack pnpm typecheck                           # tsc --noEmit, exit 0
corepack pnpm build                               # app build, exit 0
```

`tsconfig.json` excludes `src/lib/scam-checker/**/*.test.ts` from `tsc`: several UI tests import untyped browser JS from `ui/public/`, so they are executed by `node --test` (CI) rather than typechecked. Product code is fully typechecked.

The workspace suite that produced these files passes 464/464 (including the six sweep tests that stay workspace-only); the repository run adds the two repository-only drift guards.
