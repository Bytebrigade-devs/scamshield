# Temporary Netlify demo

**Redeployed with the 20 November result-page refinement and AI re-enabled — 20 November 2026:** the live site **https://scamchecker-demo.netlify.app** now serves the current `code/ui/public` build (verdict-card de-duplication, risk accent + icon, compact refinement chips) with the `netlify/functions/api.mts` function. Server-side AI is configured against the **OpenCode Go** gateway (`OPENAI_BASE_URL=https://opencode.ai/inference/go/openai/v1`, `M4_UI_API=responses`, `M4_UI_MODEL=gpt-5.6-luna`, `M4_UI_DEADLINE_MS=8000` for Netlify's ~10 s function limit); the API key is a Netlify secret and is never shipped to the browser. Deploys `6b00097a…` (draft, verified) then `6b000a82…` (production). Verified live: `/api/config` reports `liveConfigured:true`, a synthetic hosted check completed with `providerMode:live` (high risk), and a browser run showed the new layout. **The "Report a wrong result" control is absent on the hosted site** because `netlify-handler.ts` attaches no `feedback` option (pre-existing; the local `server.ts` does). Evidence: [M4-netlify-refinement-and-ai-20261120.md](../../evidence/M4-netlify-refinement-and-ai-20261120.md). The paragraph below records the earlier keyless 20 November state and is retained as history.

**Demo URL update — 10 November 2026:** the owner supplied a replacement deployment at **https://scamchecker-demo.netlify.app/**. Verified read-only on 10 November 2026: `GET /` → **HTTP 200** (`text/html; charset=UTF-8`, `Server: Netlify`, CSP and security headers present, `Cache-Control: no-store`); `GET /api/config` → **HTTP 200** with `{"liveConfigured":true,"model":"deepseek-v4.1-flash:free","api":"chat","limits":{"inputCharCap":2000,"burstWindowMs":60000,"burstMax":5},"taxonomyVersion":"0.1.0-draft"}`. No POST was made, so no provider call was triggered. **The deployment serves the older ~26 October-era build, not the current workspace build:** `/assessment.js`, `/evidence.js`, `/guidance.js`, `/guidance-cards.js`, `/summary.js`, `/summary-card.js` and `/provenance-cards.js` return **404**, while `/organization-card.js` is present; the deployed `app.js` (26,767 bytes) and `styles.css` (20,768 bytes) do not match the current workspace files (`app.js` 26,297 bytes, `styles.css` 24,333 bytes; the workspace build also ships the separate assessment/evidence/guidance/summary modules). The previous 26 October URL (`https://scamshield-m4-demo-20261026.netlify.app`) returned HTTP 404 when checked earlier on 10 November 2026. To put the current build on the new URL, deploy the current `code/ui/public` files and the function together (see the deployment section below) after an explicit owner go-ahead — **no deployment was performed by this verification**.

**Removal verification:** 253 automated tests and 196 focused browser checks passed; a synthetic live AI check completed. See the [removal record](../../evidence/M4-tavily-removal-20261030.md).


**Current local status — 30 October 2026:** Tavily integration was removed after a paired test returned zero additional verified ownership matches from 11 successful searches. The app now uses the reviewed organization directory and the configured AI provider; no live domain search is active. Earlier provider plans, configuration instructions and verification counts below are historical snapshots. See the [paired test and limitations](../../evidence/M4-tavily-paired-value-test-20261030.md). This local change has not been deployed.


**Provider decision — 30 October 2026 (approved plan; implementation pending):** Tavily testing is a planned local change; OpenAI analysis plus DeepSeek research is the final target. Current source/deployed behavior is not switched by this decision. Configure Tavily hosting variables only after its adapter exists and a separate release is authorized. See [approved provider transition plan](../../evidence/M4-provider-testing-and-target-plan-20261030.md). Earlier dated statements retain their implementation/snapshot meaning.

**Tavily-only research — 30 October 2026:** sender comparison, Tavily domain research, EDL/BOC coverage and AI reliability changes are implemented locally and have **not been deployed**. Brave support is removed. A synthetic local AI scan succeeded with the retained model before later domain-parser hardening; AI settings/adapters are unchanged. Final-source tests pass 351/351 and refreshed browser checks pass 1,140/1,140 across 132 full-page captures; the local integrity audit passes with no errors and independent reviews are pending. Local implementation and verification are complete; test/capture/live-AI execution remains dated 29 October except the 30 October Tavily/browser refresh. Live Tavily remains unverified because its key is absent. [Implementation and verification](../../evidence/M4-tavily-research-provider-20261030.md). The deployed snapshot described below remains separate.

For a later authorized deployment, configure only the AI variables documented in `.env.example`. Tavily keys and provider selectors are no longer used. Deploy the static files and function together; local changes do not update Netlify. No key belongs in the static bundle or `netlify.toml`.

**Local extension — 28 October 2026:** phone-based organization identification and separate official reference contacts are implemented and verified in the workspace. They have not been deployed; the published build described below remains the 26 October snapshot. [Local change evidence](../../evidence/M4-organization-reference-contacts-20261028.md).

**Current implementation reconciliation — 27 October 2026:** The current published organization-verification build is deploy 6adee5bfa4e3aac4fe95f618. Directory changes require a new function deployment; web lookup and a paid search service have not been added. The site has no automatic expiry. This documentation reconciliation does not redeploy it. [Current implementation, API and demo guide](../../report/M4-current-implementation-status-20261027.md). Earlier dated sections retain their snapshot scope.

Live: https://scamshield-m4-demo-20261026.netlify.app

Published and verified 26 October 2026. The organization/contact update is deploy
`6adee5bfa4e3aac4fe95f618`. The supplied synthetic Sampath example completed hosted AI
analysis and displayed its supported bank record and unconfirmed phone number.
[Original deployment evidence](../../evidence/M4-netlify-deployment-20261026.md) ·
[Organization verification evidence](../../evidence/M4-organization-verification-20261026.md).

The workspace-root `netlify.toml` publishes only `code/ui/public`. The function in
`netlify/functions/api.mts` routes `/api/*` to the existing preprocessing, rules,
boundary and AI service through `netlify-handler.ts`. The 26 October organization-verification
update also deploys the new result card and its supporting browser module.
The local server remains available as before.

Use Netlify CLI from the workspace root; a drag-and-drop upload of `public` alone
does not deploy the server function. No build command or application dependencies
are required. Netlify bundles the TypeScript function using esbuild.

Configure these variables on the new Netlify project (Functions scope where the
plan permits granular scopes; the Free plan uses all scopes):

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (the existing provider endpoint)
- `M4_UI_API` (`chat` or `responses`)
- `M4_UI_MODEL`

Never publish `.env.local`, or put credentials in the static folder or `netlify.toml`.
Environment changes require a new deploy to take effect.

Run `netlify deploy --prod --no-build` for a manually configured project. Verify
`/api/config`, then submit one synthetic message to confirm actual hosted AI analysis.
Provider calls may incur charges under the configured provider account.

This remains a temporary synthetic-message demo, not a production access/funding
implementation. The existing trial subject and in-memory usage store are shared
within each warm function instance; limits reset on replacement/cold starts and
are not a durable site-wide budget or per-user allowance. The provider's account
limits remain the authoritative spending controls. Do not treat this deployment
as closing X-09 or other product acceptance gates.

To end the demo, stop or delete its dedicated project in the Netlify dashboard.
The link does not automatically expire.

Offline verification (26 October 2026): 212/212 automated tests and 671/671 browser
checks passed. Both independent visual reviews passed all 81 captured states.
Coverage includes HTTPS same-origin handling, pipeline integration, credential
non-disclosure, invalid/oversized input, foreign-origin rejection, routing,
organization/contact matching, transport parity and unconfigured/failed AI.


## Planned provider rollout — 30 October 2026

Historical transition note: Tavily was tested and subsequently removed from the local application. A separately authorized release must deploy the current function and static files together.

Native OpenAI analysis and direct DeepSeek search are a later migration with separate credentials, tests and release verification. OpenAI hosted web search and DeepSeek Fetch/short-link expansion are not selected. See [approved provider transition plan](../../evidence/M4-provider-testing-and-target-plan-20261030.md); published snapshots above are unchanged.
