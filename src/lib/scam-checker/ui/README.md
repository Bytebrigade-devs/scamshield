# ScamShield — local scam checker

## Retired UI, surviving library — 24 November 2026 (later)

**The browser screen and its HTTP server are gone; the library is not.** The mounted checker is a
React page in the app (`src/app/checker/page.tsx` + `src/features/checker/**`), so this folder no
longer ships a front end:

- **Deleted:** `server.ts`, `netlify-handler.ts`, `public/app.js`, `public/guidance-cards.js`,
  `public/summary-card.js`, `public/index.html`, `NETLIFY.md`, and the tests that exercised those
  renderers (`server.test.ts`, `netlify-handler.test.ts`, `guidance-client.test.ts`,
  `summary-card.test.ts`). The workspace `netlify/` folder and `netlify.toml` went with them, so the
  Netlify demo is retired in favour of the Vercel deployment of the app.
- **Added:** `check-route.ts` — the framework-neutral `Request → Response` handler
  (`createCheckRoute`) carrying the transport rules the two deleted servers used to duplicate.
  `src/app/api/check/route.ts` is now a thin wrapper over it, and `guidance-service` /
  `organization-service` / `research-service` test it directly instead of standing up two servers.
- **Kept unchanged:** the nine pure view models in `public/` (`assessment`, `evidence`, `guidance`,
  `summary`, `render-safe`, `link-banner`, `feedback`, `organization-card`, `provenance-cards`) and
  `styles.css`. The React screen imports them as-is — they are the library's framework-neutral core,
  which is why the port cost days rather than weeks.
- **`notice-approval.test.ts` is repo-only** now: it guards the M1-approved notice wording by
  reading `src/features/checker/input-screen.tsx`, which does not exist in this workspace.

The commands below that start a local server no longer apply; use the app (`pnpm dev`, `/checker`).

## Current state — 24 November 2026

- **Provider deadline is 7 s by default** (`DEFAULT_DEADLINE_MS`, decision D3): the 80-message pilot's slowest healthy response was 6.25 s, so 7 s covers it with margin and only a genuine hang falls back. It was 45 s — longer than any serverless timeout. Each deployment sets `M4_UI_DEADLINE_MS` so that *deadline + one fallback* fits its function timeout (Netlify keeps 8 s; the host is temporary).
- **The durable store is wired and usable**: `check-service` accepts a `DurablePersistence`, `EventSink.append` is async, and `persisted-check.ts` writes check + findings + history in one call. Feedback has a durable path whose ownership proof is the `checker_feedback → scam_checks` foreign key. **Unset `M4_DURABLE_STORE` means in-memory — true in every deployment.**
- **The demo requires a verified caller**: no `Authorization` header → 401, no entitlement → 403, unverifiable → 503, and a refusal never reaches the provider.
- **Cleared results never carry a scam category** (adjudication, 24 Nov): `validateReply` coerces the category to `unknown_other` when the verdict is `no obvious indicators`.
- Counts: workspace **649/649**, repository **664/664**, sweep **103/103**.
- Still unmeasured: Sinhala/Tamil on `gpt-6-luna` (the 500-message run is authorized, meter-check first).

## Primary model changed to `gpt-6-luna` — 22 November 2026

Owner decision: **`gpt-6-luna` is now the primary model** (`DEFAULT_MODEL` in `code/boundary/openai-adapter.ts`; `M4_UI_MODEL` in the local-only `.env.local`), replacing `gpt-5.6-luna`. **`gpt-5.6-luna` is the single fallback** (`M4_UI_FALLBACK_MODEL`), used for exactly one extra attempt and only on a transport failure (`timeout`/`network`/`http-error`) — never after invalid or refused output, never retried for a more confident answer (`code/boundary/fallback-provider.ts`). Basis: the 40-pair / 80-message comparison — 80/80 completed, **39/39 intended scams flagged (unchanged)**, **40/40 legitimate near-matches cleared (vs 29/40)**, 0 clear scams labelled safe, latency +4% mean (4,143 vs 3,980 ms) — [record](../../evidence/M4-pilot-live-80-gpt6luna-20261122.md). `/api/config` now reports `fallbackModel`, and a failed fallback still ends in a labelled unavailable state. The Netlify environment variables are updated to match (`M4_UI_MODEL=gpt-6-luna`, `M4_UI_FALLBACK_MODEL=gpt-5.6-luna`); see `NETLIFY.md`. Still unmeasured: Sinhala/Tamil behaviour, an approved latency threshold, and grounded-span adjudication. Local verification after the change: workspace suite **561/561** plus the new fallback tests, and a live smoke **3/3 completed** on `gpt-6-luna`.

## Live provider and prompt baseline — 19 November 2026

The configured **testing** provider is now the owner's **OpenCode Go** subscription — gateway `https://opencode.ai/inference/go` (OpenAI-compatible Responses API), the recorded primary model **`gpt-5.6-luna`** (superseded 22 November 2026 — see above), the same listed rates, and the Go usage allowance (Extra Usage off) as the hard stop. The Responses adapter sends the Go-required `user-agent` and a stable `x-opencode-session` header; the key stays local-only in the gitignored `code/ui/.env.local`. **X-09 is closed owner-self-certified** (key accepted, single smoke 3/3 completed), and the live work is recorded: the **40-pair pilot (80/80)** and the **500-message detector run (500/500; scam 350/350 flagged)**. The amended OD-M4-04 prompt instruction is **accepted as the draft baseline** (28/32 control overflags cleared, 20-message scam canary 20/20, sweep 103/103). Native OpenAI remains the recorded production target. [Amendment](../../evidence/M4-x09-opencode-go-provider-amendment-20261119.md) · [Closure](../../evidence/M4-x09-closure-20261119.md) · [Pilot](../../evidence/M4-pilot-live-80-20261119.md) · [500-message run](../../evidence/M4-500-live-run-20261119.md) · [OD-M4-04 acceptance](../../evidence/M4-od-m4-04-acceptance-and-adjudication-20261119.md).

Verification at this boundary: workspace suite **500/500**, strict sweep **103/103**; repository `main` = **`c946e13`** with **495/495** library tests (PR #44). The Netlify demo is unchanged by this round; no accuracy, real-world-coverage or deployment claim follows.

## Reviewed directory expansion — 13 → 28 organizations, 20 November 2026

The reviewed offline directory grew by **15 verified organizations** across the three approved tiers:
National Savings Bank, Seylan Bank (call centre published), Dialog (1777 hotline published), SLT-Mobitel
(one record — slt.lk operates under the SLTMobitel brand), CEB, LECO, the Inland Revenue Department, the
Department of Posts, the Department of Immigration and Emigration, Daraz, Kapruka, WhatsApp (Meta),
Telegram, Western Union and Wise. Every fact was confirmed on the organization's own page before entry
(reviewedAt 2026-11-20); the reviewed-source-host allowlist, the rule-engine brand projection and two
guidance resources (Seylan security notice, NSB contact) followed. New kinds `government`/`commerce` were
added to the schema. **Omitted as unverifiable from the review machine** (open items, never guessed): NDB,
DFCC, the National Water Board, Takas, UPS, Aramex, SriLankan Airlines, and the CBSL register (the new
banks are verified via their own sites instead). Both offline fixture clocks moved to 2026-11-20 so the
new facts are not future-dated in evidence.

Verified: Node **541/541**, sweep **103/103** (new spelling references shifted no expectations), browser
matrices **479 + 996 + 436 + 196 = 2,107 assertions, zero browser errors** (the organization matrix grew
by four new cases: Dialog, Daraz, WhatsApp, IRD). Deployed (production `6b006886…`); live checks confirm a
Dialog message matching name-and-domain with the 1777 hotline and an IRD fake-penalty message matching
with a `suspicious` AI verdict. Re-read each new source within the 90-day window (by 18 February 2027).
[Change and deployment record](../../evidence/M4-directory-expansion-20261120.md).

## Visual polish — background depth, header mark, honest loading motion, 20 November 2026

The page no longer reads as an empty canvas: a quiet teal radial wash sits over the slate base, the header
is sticky/translucent with a shield-check wordmark, and the verdict card carries stronger elevation plus a
3–4% risk-coloured tint (existing tokens only, no new design tokens). The verdict heading is now 26 px
desktop / 24 px phone. Loading is visible: an animated spinner inside the Check button and a 3 px
indeterminate bar on the header edge (no percentage or invented steps), hidden once the result renders.
Cards rise in with a short stagger and opened disclosures fade; all of it is disabled under
`prefers-reduced-motion` (the ordering bug that let the entrance animation survive reduced motion was
caught by a probe and fixed before deploy).

Verified: Node **541/541**, sweep **103/103**, browser matrices **479 + 996 + 356 + 196 = 2,027
assertions, zero browser errors**; contrast 5.02–17.85, no overflow at 320/390/768/1440. Heights: mobile
2,060 px, desktop 1,843 px. Deployed (production `6b0056e2…`) with hosted AI live.
[Change and deployment record](../../evidence/M4-visual-polish-20261120.md).

## Simplified checks and official-support layouts — 20 November 2026

The two evidence disclosures were de-duplicated so users can scan them: contact rows are one line
(`Phone number: …` + status) with "Listed for …" kept but per-match citation blocks removed; every
reviewed source now appears **once per record** in a compact "Reviewed sources" list instead of being
repeated under each contact; unconfirmed contacts share one honesty line per record; each official
resource is **one muted meta line** (purpose · organization · region · scope) with sources consolidated
at card level; outdated provenance stays inert in the consolidated list; and the duplicated
trusted-channel sentence was removed from the link card (it remains once, in the resources card). All
statuses, `data-*` attributes, inert-URL behaviour and approved source-link rules are unchanged.

Verified: Node **541/541**, sweep **103/103**, browser matrices **479 + 996 + 356 + 196 = 2,027
assertions, zero browser errors**. Deployed (production `6b004eda…`), hosted AI still live.
[Change and deployment record](../../evidence/M4-checks-resources-simplification-20261120.md).

## Instructions-only steps, button-first export, message at top — 20 November 2026

Three owner-requested changes on top of the simplification round:

- **Top = instructions only.** The tick checkboxes are gone; the step list is driven by the bottom
  "What happened?" answers (unanswered → general steps; shared/paid → urgent bank step; clicked/shared →
  device/account steps). Ticks were removed from the exported summary too — it now lists each visible step
  once, with no `[x]` marks.
- **Export is a button card.** "Export this check" no longer shows the summary text: it shows
  Copy / Download TXT / Print, with the text behind an opt-in "Review summary text" details. Print,
  clipboard, TXT bytes and the canonical string are unchanged.
- **"The message you checked" is visible at the top**, directly under the verdict, and removed from the
  disclosure group (now three disclosures). Trade-off recorded: the message text and submitted URLs are
  now readable on the results page without opening anything; links stay inert.

Measured: mobile **2,021 px**, desktop **1,839 px** (the message card adds ~287 px; hiding the export
preview returns ~50 px). Verified: Node **541/541**, sweep **103/103**, browser matrices **479 + 996 + 356
+ 196 = 2,027 assertions, zero browser errors**. Deployed (production `6b004128…`) with hosted AI live
(`gpt-5.6-luna`). [Change and deployment record](../../evidence/M4-result-instructions-export-message-20261120.md).

## Result page simplified — one-screen verdict, checklist actions, 20 November 2026

Owner feedback: the result page was "too complicated and lot to scroll." The page now leads with the
verdict as the page `h1` (the old eyebrow + "Your message assessment" block is gone), and each next step
is a **one-line action** instead of a paragraph — the full approved sentence stays in a single closed
"Full guidance for each step" panel, and the priority-0 money action keeps its full text expanded. The
optional "What happened?" helper and tick-honesty sentence moved into a "How answers and ticks are used"
details; chips render 2-up at phone width. Pattern quotes now carry one muted reason line, the AI reason
clamps at 4 lines on phones / 6 on desktop with the existing Read-full control, and disclosure rows are
44 px with tighter gaps. Exports still emit the full approved action sentences.

Measured: mobile completed **2,451 → 1,772 px (−28 %)**, desktop **2,029 → 1,702 px**; live site with a
real AI reason is 1,810 px mobile with the first step at 603 px (first screen). Verified: Node 538/538,
sweep 103/103, browser matrices 479 + 1019 + 356 + 196 (**2,050 assertions, zero browser errors**).
Deployed to Netlify (production `6b003955…`) with hosted AI still live (`gpt-5.6-luna`, `responses`).
[Change, measurements and deployment record](../../evidence/M4-result-page-simplification-20261120.md).

## Result-page refinement + feature-harness repair — 20 November 2026

Owner-approved presentation round (review items 1–3, then item 5 polish, then item 4 on sign-off) plus
repair of the drifted feature harnesses. Product changes are in three files in `code/ui/public/`;
assessment, guidance, provider, storage, history and export semantics are unchanged:

1. **Verdict card de-duplicated.** The AI risk meter keeps only the qualitative bands (and the
   "Undetermined" line); the redundant "Analysis source" paragraph was removed (the factual status line
   already states what ran), and the distinct local-pattern count moved into the evidence card title —
   **"Patterns in your message · N"** — beside the evidence it counts.
2. **Risk accent + verdict icon.** The assessment card gains a risk-coloured top edge and a decorative
   Lucide icon (alert/shield/info) beside the heading, using only existing palette tokens. The icon is
   `aria-hidden`; the heading text still carries the risk wording, so nothing relies on colour alone.
3. **Compact "What happened?" refinement.** The four exposure options are wrapping toggle chips — still
   native labelled checkboxes with unchanged keyboard/screen-reader behaviour. "Clear answers and ticks"
   appears only once something is selected, and the unanswered status line is shortened.
4. **Feedback control demoted.** "Report a wrong result" is now the fifth collapsed disclosure
   ("Something wrong with this result?") instead of a full-width card; the card itself is unchanged.
5. **Optional polish.** On completed checks the redundant `Mode:` item is dropped from the status line;
   the AI reason is capped at a `68ch` reading measure on wide viewports; the undetermined risk scale is
   rendered visually inactive (CSS-only, no markup change).

**Feature-harness repair (QA tooling only):** the older feature matrices had drifted from the 17 November
disclosure restructure and the 18 November always-on `feedback` field — they read/clicked export and
organization/sender content without opening the disclosures it now lives in, and the legacy assertion used
a stale key whitelist. Before any repair, `evidence_capture.py` was run against the original and changed
public files and produced the **identical 105-failure set**, proving the presentation round added zero
regressions. The harnesses now open the relevant disclosure before reading/capturing, and the legacy
assertion checks that optional *evidence* keys are absent (accepting `feedback`). No frozen fixture or
testing input was modified.

Verified offline today (final state): workspace Node suite **538/538**, strict sweep **103/103**
(0 mismatches, one review-required), general browser matrix **479/479**, feature matrix **1023/1023**,
organization matrix **356/356**, sender/research matrix **196/196** — **2,054 browser assertions, zero
browser errors**. Measured full-page heights after the change: desktop completed **2,029 px**, mobile
completed **2,451 px** (from 2,354 / 2,786 px at the start of the round); demoting the feedback control
alone saved ~325 px desktop and ~335 px mobile. A fresh independent visual review remains open.
**Deployed to Netlify on 20 November 2026** (production deploy `6b000a82…`), with server-side AI
re-enabled against the OpenCode Go gateway (`gpt-5.6-luna`, `responses`, 8 s deadline for Netlify's
function limit) and verified live: `/api/config` reports `liveConfigured:true` and a synthetic hosted
check completed with `providerMode:live`.
[Change and verification record](../../evidence/M4-result-refinement-20261120.md) ·
[Deployment and AI re-enable](../../evidence/M4-netlify-refinement-and-ai-20261120.md).

## Result-page layout — minimal hierarchy, 17 November 2026

Owner-reported problem: the result page felt like a long stack of unrelated cards ("I feel lost in the
result page"), with the advice users actually need buried below the evidence. The result page was
restructured around one verdict and one next action, top to bottom:

1. **Verdict card** — risk heading, preserved AI reason with highlights, the qualitative risk
   indicator, one factual line (which scans ran, analysis mode, category), safety footnote.
2. **What to do next** — steps first; the optional "what happened?" refinement sits below them.
3. **Patterns in your message** — the local rule evidence, still always visible.
4. Four collapsed disclosures — *The message you checked*, *Sender, organization and link checks*,
   *Official support and reporting*, *Export this check*.
5. Footer action (**Check another message**).

Nothing was deleted: every previously visible card, cancellation note, official-resource record,
limitation and export control is still present and unchanged in content, but reference material is now
progressively disclosed with native `<details>`/`<summary>` (keyboard-operable, no script, no new
storage). The old two-column `result-columns` shell was removed — the advice and resources column was
2,741 px tall against roughly 560 px of message-plus-evidence, i.e. about 2,200 px of dead space. The
two-row scan-status block and the two-field meta grid collapsed into one factual line, and the risk
indicator kept its `data-risk`/band markup with tighter spacing.

The AI reason is clamped to four lines **on phones only**, and only when the app measures that the
saving is worth the control (>48 px hidden): a **Read full explanation / Show less** button with
`aria-expanded`/`aria-controls` then reveals it. Nothing is removed, rewritten or re-rendered — the text
is only visually clipped, so copy, exports, `textContent` and screen-reader readings keep the full
reason. Desktop and short reasons are never clamped and the control stays hidden.

Measured on one live high-risk check (the same response replayed at each width): desktop 1440×1000 full
page **6,416 px → 2,282 px** (6.4 → 2.3 screens) and mobile 390×844 **9,060 px → 2,597 px**
(10.7 → 3.1 screens). The actions card now starts at 705 px on desktop (was 2,045 px) and at 724 px on
mobile, with the first action row at 845 px — on the first screen instead of far below it. Every
fixture outcome at 390 px puts the first action between 753 px and 845 px. Expanding all four
disclosures yields 6,001 px desktop / 8,580 px mobile — shorter than the previous always-expanded page,
because the dead column space is gone. No horizontal overflow at 320, 390, 768 or 1440 px, or at 200%
text enlargement. This is a presentation change only: assessment, copy, provider, storage and export
semantics are untouched; the offline browser matrix re-passed **479/479** with zero browser errors and
58 fresh captures, and the automated suite still passes 202/202.

## Evidence and next steps — 31 October 2026

Local scope: offline source-backed link evidence, reviewed next steps and a minimized shareable summary. The dated provider/research entries below retain their historical meaning; no live domain-reputation/ownership search is introduced. Post-review final-source verification: **338/338 automated tests**, unchanged sweep **103/103** evaluated (zero mismatches; one review-required), **479/479 general + 356/356 organization/contact + 196/196 sender/failure + 1,167/1,167 feature** browser assertions, **408 captures**, independent packet audit **PASS**, final independent security review **PASS / no blockers**, and two final independent visual reviews **PASS** (functional HIGH; fidelity MEDIUM). [Implementation and verification record](../../evidence/M4-evidence-next-steps-20261031.md).

- **Before submission:** remove passwords, OTPs, full card/account numbers, private keys and other sensitive details. ScamShield does **not** automatically mask them. The original submitted message, optional sender information and relevant findings may reach the configured AI provider; the message is not on-device-only.
- **Lookalike evidence:** supported Latin/Greek/Cyrillic hostnames are compared with reviewed official domains using pinned Unicode 18.0.0 confusables data and built-in URL/IDNA handling. Submitted destinations are not opened. Similarity is a possible lookalike for review, not proof of fraud; unlisted domains remain unconfirmed and stale references remain explicit. Local findings never mechanically set AI risk.
- **Official resources:** purpose, regional scope, source and review date accompany reviewed security/recovery/reporting/general-contact resources. Apply the existing 90-day review window. Missing or outdated resources use an independently trusted official-channel instruction; general/head-office numbers are not fraud hotlines.
- **Your next steps:** optionally choose received-only, or any combination of clicked/opened, shared-sensitive-information and sent-money. Received-only is exclusive; no answer is a separate state. Answers/checklist ticks remain in browser memory, trigger no requests and reset for a new check. They are not added to tab-session history. Urgent financial contact advice is conditional on the affected bank/payment provider, not assumed from a name in the message.
- **Summary:** review the preview, then copy, download UTF-8 TXT, or open print/save-as-PDF. The same plain text drives all four. It includes check status, approved evidence summaries, selected answers/actions, clearly labelled official sources and limitations. It excludes original text/excerpts, submitted URLs/hostnames/phone numbers, sender values, AI explanations and provider details. Official reference URLs/contact numbers may remain. It is bound to the submitted check, not later draft edits; no new persistent history or server report is created. Clipboard failure offers manual copy. Printing includes only the minimized summary.

The API remains compatible with `POST /api/check { text, sender? }`; `{ text }` alone remains valid. Optional **server-owned** `linkInspection` and `guidanceResources` are attached only to admitted analyses, including rules-only and AI-unavailable results. Browser-supplied findings have no authority. No exposure/checklist/summary fields are sent to the API; no new reporting/export endpoint exists.

Sensitive-value masking (including evidence before AI transfer), screenshot input, live reputation, community reports, practice mode, WhatsApp distribution, family accounts and pricing changes remain future work. This local implementation does not authorize release/deployment or establish production readiness.

**Historical removal verification (superseded snapshot):** 253 automated tests and 196 focused browser checks passed; a synthetic live AI check completed. See the [removal record](../../evidence/M4-tavily-removal-20261030.md).


**Current local status — 30 October 2026:** Tavily integration was removed after a paired test returned zero additional verified ownership matches from 11 successful searches. The app now uses the reviewed organization directory and the configured AI provider; no live domain search is active. Earlier provider plans, configuration instructions and verification counts below are historical snapshots. See the [paired test and limitations](../../evidence/M4-tavily-paired-value-test-20261030.md). This local change has not been deployed.


**Tavily-only domain research — 30 October 2026 (implemented locally):** Brave Search is removed; hostname-only Tavily Basic research is the sole live provider and Token Harbor message analysis is retained. The final-source suite passes **351/351**, strict sweep **103/103**. Refreshed browser evidence passes **1,140/1,140 assertions across 132 full-page captures**, with 21 supplementary card captures and 56 alpha-intact comparisons; all 16 captured-source hashes match and baselines are unchanged. The local integrity audit passes with no errors. Live Tavily is not exercised (key absent); independent reviews are pending. [Implementation evidence](../../evidence/M4-tavily-research-provider-20261030.md). The final roadmap is OpenAI message analysis only plus direct DeepSeek Search; neither is built here. These changes are local, not deployed. Earlier dated statements retain their implementation/snapshot meaning.

**Local implementation — 29 October 2026:** optional sender comparison, hostname-only Brave research, EDL/BOC directory coverage and explicit AI failure diagnostics are implemented. AI defaults are 4,096 output tokens / 45 seconds; the configured Token Harbor model is retained. The final-source suite passes **348/348**, strict sweep **103/103**. Refreshed browser evidence passes **1,102/1,102 assertions across 130 full-page captures**, with 21 supplementary card captures and 56 alpha-intact comparisons; all 16 captured-source hashes match and baselines are unchanged. Both independent final integrity and visual reviews completed on **30 October 2026: PASS / high confidence, no blockers**; local implementation and verification are complete. The test/capture runs remain dated 29 October. [Implementation evidence](../../evidence/M4-domain-research-sender-ai-reliability-20261029.md). A synthetic live AI scan succeeded before the later parser edits; AI settings/adapters are unchanged. Brave is not active until a server-only `BRAVE_SEARCH_API_KEY` is supplied. These changes are local, not deployed to Netlify. Earlier dated sections below describe their snapshots.

## Sender, research and AI configuration — 29 October 2026

`POST /api/check` accepts `{ text, sender? }`; sender information is optional, at most 254
characters, and remains separate from message text/highlights. Blank sender input is omitted.
User-supplied sender information is unverified and spoofable. It accompanies the message to
the configured AI provider but is not added as a separate history field or to shared exports.

The directory now includes EDL as its thirteenth organization and the BOC alias. Exact EDL
hosts `edl.lk`, `edlcare.edl.lk` and `myedlpay.edl.lk` have reviewed official sources.
`ebill.edl.lk` and `asl.lk` remain unconfirmed pending adequate exact-host evidence.

No live domain research is active. The reviewed directory compares supported hostnames and contacts; unknown ownership stays unconfirmed. Submitted links are not opened or followed. Optional `senderVerification` and `aiFailure` service fields remain available; message-only requests remain supported.

| Server variable | Default / validation |
|---|---|
| `M4_UI_MAX_OUTPUT_TOKENS` | 4096; integer 512–8192 |
| `M4_UI_DEADLINE_MS` | 45000; integer 5000–60000 |

Invalid AI settings fail production configuration validation. AI diagnostics distinguish
truncation, timeout, rate limiting, invalid response, network failure and provider error without
returning provider bodies or credentials. There is one attempt, no retry/fallback, and incomplete
JSON never becomes a verdict. Start normally with `node code/ui/server.ts`; no dependency install.
After adding or changing server-only environment settings, restart the local server to load them.

**Local improvement — 28 October 2026:** related organizations can also be identified by a listed phone number. Each recognized organization now includes separate official reference websites and scoped phone numbers, even for third-party mentions or messages with no contact details. Submitted contacts keep their own comparison results; references carry source dates and individual outdated labels. This uses the existing twelve-organization directory, with no live web search. Verified locally: 235 automated tests, 103/103 evaluated rule expectations and 833 browser checks across 93 full-page captures. This improvement has not been deployed. [Change and verification record](../../evidence/M4-organization-reference-contacts-20261028.md).

**Current implementation reconciliation — 27 October 2026:** Documentation reconciled on 27 October against the already completed 26 October deployment. The maintained directory is bundled server-side on Netlify; it is not a per-message online search. Read-only availability/configuration checks and a 212-test rerun are recorded in the documentation audit. No new live AI scan or deployment was performed during this documentation update. [Current implementation, API and demo guide](../../report/M4-current-implementation-status-20261027.md). Earlier dated sections retain their snapshot scope.

Temporary hosting: see [Netlify deployment notes](NETLIFY.md) for the server function,
server-only configuration and demo usage-limit caveats.

**Updated:** 26 October 2026 · **Status:** reviewed organization/contact matching and result card implemented; 229/229 automated tests (re-verified 27 October after the boundary hardening sync), unchanged 103/103 evaluated rule expectations and 671/671 offline browser checks across 81 fresh captures. Earlier dated verification below is historical. No Git commit or push.

The local interface uses the approved navy–teal theme and bundled Plus Jakarta Sans. It offers a
message form, analysis results and tab-session history without developer controls or forced outcomes.
The actual preprocessing, rule engine and server-side check boundary run for every admitted check.

## Run and verify

Requires Node ≥ 22.18 (current verification environment: v24.22.1). No npm install or runtime
dependencies are required. Run from the M4 workspace:

```text
node code/ui/server.ts
node --test code/preprocess/*.test.ts code/rules/*.test.ts code/boundary/*.test.ts code/ui/*.test.ts
node code/rules/sweep.ts --strict
python code/ui/qa/capture.py
```

Open `http://127.0.0.1:4173`. The browser harness requires Python Playwright, Pillow and installed
Chrome; it launches isolated offline fixture servers automatically. See [QA instructions](qa/README.md).

## Organization and contact directory — 26 October 2026

Every admitted analysis now includes a server-generated `organizationVerification` field alongside
`outcome` and `providerMode`. The existing `{ text }` request is unchanged; browser-supplied
verification fields have no authority. Rejected requests do not access the directory or receive
verification metadata. Both AI transports receive exactly the same per-request findings displayed
by the new **Organization and contact checks** card. Directory findings remain available when AI
is missing or fails; they do not set the AI risk band or authenticate the sender.

The server-only directory covers Sampath Bank, Bank of Ceylon, Commercial Bank of Ceylon, HNB,
People’s Bank, DHL, FedEx, PayPal, Microsoft, Google, Apple and Amazon. Each fact has an official
source, context and review date. Bank licensing is supported by the dated CBSL register; other
identity descriptions state only what the organization’s own publication establishes. The list
is incomplete and recognizes conservative name aliases and explicitly reviewed hostnames.
The 28 October local extension also recognizes listed phone numbers and adds `officialContacts`
to each organization finding, independently of the supplied `contacts`. The browser labels these
as **Official contact details**, shows regional phone scope and source review dates, and keeps
stale references explicitly outdated. Organizations with no reviewed phone number say so.
Older responses without `officialContacts` still render their existing checks. A generic message
without a known name, reviewed domain or listed number does not identify an organization.
Unlisted contacts/organizations are **not confirmed**, never automatically fake. The sample
`0112303050` has no confirmed directory record; no ownership is inferred from model memory.

Matching is offline: no submitted destination is opened and no per-message search is performed.
Phone formatting and configured Sri Lankan domestic/`+94` equivalents are normalized; regional
scope remains visible. Short codes require a contact cue, not an OTP/date prefix. Domains use
parsed hostnames and a single left-to-right address tokenizer so nested trusted-looking URLs,
userinfo, deceptive suffixes and Unicode lookalikes cannot manufacture an official match.

Review each fact within **90 days** of its review date. To maintain the directory, read its primary
source again, update only supported facts and their dates, then rerun organization tests and browser
checks. Invalid, future-dated or overdue facts display as outdated. No automatic refresh is configured.
Source URLs are clickable only for the reviewed official-source hosts; submitted contacts remain
plain text. Matching official details does not authenticate the sender or prove the message safe.

Feature QA: `python code/ui/qa/organization_capture.py`. [Implementation and live evidence](../../evidence/M4-organization-verification-20261026.md).

## Analysis and API behavior

```text
browser → POST /api/check { text, sender? }
        → validation / server-side access and usage gates
        → extraction / reviewed contacts / sender comparison / rules
        → optional hostname research → configured provider
```

Provider selection belongs to the server:

| Server state | Boundary outcome | User-facing meaning |
|---|---|---|
| AI configured and reply validates | `completed` / `rules_and_ai` | AI assessment plus local rule evidence |
| AI not configured | `limited` / `rules_only` | Rules-only analysis; no AI assessment or safety conclusion |
| AI fails, times out or returns invalid output | `unavailable` / `none` | No usable assessment; local rule evidence is still shown; no automatic retry or fallback model |

`POST /api/check` reads `text` and optional `sender`; browser-supplied provider selectors, identity, plan and quota
fields have no authority. `GET /api/config` reports capability and limits without credentials.

The live prompt is a documented draft; the round-1 instruction is **accepted as the OD-M4-04 draft baseline** (19 November 2026), while reply/deadline semantics remain tracked. The submitted text travels as a pristine
user message; the system message carries the analysis instructions plus this text's local rule
findings (matched excerpt, rule id, context) so the provider can use them as evidence — a verdict
still comes only from the provider. The provider is told it has no internet access and may never
claim live verification or open links; when no local pattern matched it compares against known scam
campaigns and the popular services they imitate; recognised scam or impersonation destinations are
named, unverified destinations are called unverified and never safe; and the returned reason must
explain the specific tells so an ordinary reader understands why the message is or is not a scam.
Check requests require JSON content type and reject cross-origin browser submissions. Malformed
request-target URLs are handled as bad requests. There is no public usage-reset endpoint. Existing
validation, 2,000-character limit, five-per-minute
burst guard, trial allowance and reservation cleanup are unchanged.

The check service accepts server-construction `provider`/`fetchImpl` injection for deterministic
tests. The application entrypoint does not import the simulated provider. Browser fixtures live in
`qa/fixture-server.ts` and are never served as product controls.

## User journey and data handling

- **Check message / History** navigation preserves unsent text. Loading prevents duplicate submissions.
- The character counter is always visible; over-limit text is retained for editing, never truncated.
- Invalid input gets an associated field error. Connection, access, rate and quota failures are
  form-level errors and do not mark valid message text as invalid.
- The pre-submit notice describes the configured processing path, warns against pasting secrets,
  explains guidance limits and discloses tab history. Expanded details avoid unsupported provider
  retention promises or a nonexistent privacy-policy destination.
- Results retain exact text-grounded highlights and inert submitted URLs, preserve line breaks,
  group overlapping evidence and explain rules in ordinary language. One factual status line states
  which checks ran (local pattern scan always; AI analysis completed, failed or not configured),
  and a qualitative AI risk indicator shows **Low concern / Suspicious / High risk**, or a neutral
  **Undetermined** when there is no usable risk metadata or AI assessment. The heading and selected
  band use one mapping; free-form verdict wording and local pattern counts never set the band.
  The distinct local pattern count remains separate supporting evidence. Analysis-source wording
  states what ran without claiming measured confidence. Unknown categories appear as **Not classified**.
  Since 17 November 2026 the page order, collapsed reference material and the compact status line
  follow the [minimal result layout](#result-page-layout--minimal-hierarchy-17-november-2026).
- The full AI reason is preserved with optional bold, subtly highlighted excerpts. The server accepts
  at most four exact quoted excerpts, anchors their first occurrence using UTF-16 offsets, deduplicates
  and merges overlapping spans, and limits their combined coverage to 35% of the reason. Excerpts
  render as sanitised text nodes inside `mark` / `strong`; URLs remain inert and Unicode protections
  remain length-preserving. Invalid or missing optional metadata never discards an otherwise valid reply.
- History holds at most 20 short excerpts and outcome summaries under
  `scamshield-check-history-v2` in session storage, with an in-memory fallback. It is not account
  history or server persistence; session restoration depends on browser behavior. Legacy simulated
  rows are not imported. **Clear history** clears the list only, never server usage or provider records.
- Official support is a user-initiated link to [Sri Lanka CERT](https://www.cert.gov.lk/report_incident),
  rechecked 25 October 2026. Nothing is reported automatically; suspicious submitted URLs remain inert.

Untrusted message, provider and history text uses `render-safe.js` and DOM text nodes. The existing
escaping/bidi protection, local fonts, restrictive CSP and static path guards remain in place.

## Result presentation metadata (owner-approved local refinement, 25 October 2026)

Both provider transports request optional `risk_level` (`low`, `suspicious`, `high`, `undetermined`)
and `reason_highlights` (up to four exact strings from `reason`). The boundary returns `riskLevel`
and `reasonHighlights` (validated `{ start, end, excerpt }` spans). Missing/unrecognised risk maps to
`undetermined`; missing/invalid highlight metadata yields no emphasis. Legacy replies still complete.
The base `verdict`, `category`, `taxonomy_version`, `reason` validation and `{ text }` request remain
compatible; the shared taxonomy/event contract and history row shape are unchanged. New history
summaries use the canonical risk heading; existing session rows remain readable.

The band describes the overall AI assessment: low means no obvious indicators with authenticity
unverified, suspicious means concerning evidence merits verification, high means strong indicators
of deception or harmful action, and undetermined means insufficient information. The prompt explicitly
rejects using rule count or a domain suffix alone as severity. The Responses output allowance is now
800 tokens to accommodate the full explanation and additional metadata; no retry or fallback was added.
This is presentation consistency, not calibrated confidence or demonstrated detector accuracy.
See [implementation and verification evidence](../../evidence/M4-result-risk-and-highlights-20261025.md).

## Optional server-side AI configuration

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `M4_UI_API`
(`chat` or `responses`) and `M4_UI_MODEL` as needed. The gitignored file is read only on the server.
Never put credentials in browser code, test evidence or the repository. Restart the server after
configuration changes. Synthetic messages only remain the local evaluation rule.

Configured AI is used automatically on a deliberate submission. `node code/ui/live-smoke.ts`
explicitly makes real provider requests and may incur cost; the ordinary automated suite and browser
harness stay offline. No live provider call was made during this refinement session.

## Verification and limits

**Current result build — 25 October 2026:** **188/188 automated tests**, strict sweep **103/103**
evaluated expectations (zero mismatches, one review-required case), **477/477 offline browser checks**,
**58 fresh captures / 18 comparisons**, and fresh independent final review **PASS / high confidence,
no blockers**. [Current result evidence](../../evidence/M4-result-risk-and-highlights-20261025.md).
The earlier same-day snapshots below preserve their original results; their old pattern meter,
confidence captions and pending visual-review statements are superseded by the current build.

Earlier refinement verification after independent-review hardening: **182/182 workspace tests** (including
**13/13 HTTP server tests**); unchanged rule sweep **103/103 evaluated expectations**, zero
mismatches, one review-required case. The post-hardening offline browser run passed **245/245 checks**
with **zero browser errors**, **40 fresh captures** and **18 baseline diffs**. The parent independently
reran the browser matrix with the same passing result. Both fresh independent reviewers returned
**PASS / high confidence, with no blockers** on this same build; final evidence is recorded in
[the refinement record](../../evidence/M4-user-facing-refinements-20261025.md). Earlier interim counts
(180 automated tests; the pre-hardening browser run) are historical snapshots.

After that acceptance, one owner-reported change was made on 25 October 2026: the **unavailable**
result page now shows the highlighted message and the "Patterns in your message" evidence card, because
the local rule stages always run even when the AI call fails (previously this evidence was hidden and
only the message text appeared). A second owner-requested change the same day made every result page
state which scans ran, label the AI failure explicitly ("AI analysis failed" amber banner, "Local scan
completed" heading), and added the pattern signal meter with its reading-basis caption. Re-verification
after both changes: **182/182 automated tests** and an offline browser run of **273/273 checks**
(assertions covering scan-status rows, meter levels and basis captions in all three result states),
**zero browser errors**, **40 fresh captures**. The earlier 245/245 run and both independent PASS
verdicts apply to the previous snapshot; the changed result pages still need a fresh independent
visual review. Details are in the addenda of the refinement record.

A third owner-requested change the same day enhanced the live prompt: local rule findings are now
shared with the provider as evidence, a knowledge-based scam-pattern comparison covers messages
with no local match, recognised scam or impersonation destinations are named without ever opening
links, and the returned reason must explain the specific tells. The pre-submit notice was updated
to disclose that local pattern matches are shared with the provider. Re-verified: **182/182**
automated tests, **273/273** browser checks, and a live provider smoke run in which **3/3** synthetic
messages completed with reasons that name the tactics, cite the local findings in plain words and
address the link or contact destination.

A live synthetic-message evaluation followed the same day: **20 scam-style messages, 20 flagged**
(9 with no local-rule match — the AI knowledge branch carried them), and **10 benign-style
messages, 8 cleared with 2 soft "Potentially suspicious" cautions** on spoof-prone message types
and zero local-rule false positives. Full record and limits:
[the live sweeps record](../../evidence/M4-live-message-sweeps-20261025.md).

This is a polished local interface, not production acceptance. The fixed local trial identity and
in-memory usage store do not implement real M2 authorization or persistent quotas. X-09 funding,
provider/history retention and draft verdict semantics remain open at their existing boundaries.
No M6 event emission, confidence estimation, new authentication, database or payment integration is
introduced. No model-accuracy, multilingual-coverage or full-accessibility certification is implied.

Historical evidence: the 24–25 October prototype had simulated defaults and public state controls.
Those runtime descriptions are superseded by this update; the prior capture files and dated workspace
records are retained. A prior AgentRouter test recorded HTTP 401 authentication rejection and no
completed live analysis; that is historical evidence, not a new provider test or a repaired credential.


## Provider configuration — 30 October 2026

Historical snapshot, superseded by the removal notice above: Tavily-only research was implemented: `M4_UI_RESEARCH_PROVIDER=tavily` (or absent, which
defaults to Tavily) with a privately entered server-side `TAVILY_API_KEY`. `brave` and any
other selector value fail configuration validation; `BRAVE_SEARCH_API_KEY` is no longer
recognized. Research results carry `provider: "tavily"`; legacy payloads without provider
metadata render generic wording. The final OpenAI-analysis / direct-DeepSeek-search target
remains a roadmap and is not built; see [Tavily implementation evidence](../../evidence/M4-tavily-research-provider-20261030.md)
and the [prior transition plan](../../evidence/M4-provider-testing-and-target-plan-20261030.md)
(the dual-provider portion of that plan is superseded by Brave removal).
Enter credentials only in the ignored server-side environment file, never chat or documentation.
