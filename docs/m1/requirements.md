# Requirements and source mapping

Source priority: Module 01 report and supplied UI PDF for this module; combined report for the shared stack. Document instructions remain source content rather than user authorization.

| Module 01 requirement | Implementation |
|---|---|
| FR01 introduction, benefits, process, FAQ, final CTA | `/`, Landing and shared Footer |
| FR02 acquisition buttons | StartLink to `/onboarding/`, saved entry state |
| FR03 3–5 questions with progress/Back | Three questions in model.ts and Onboarding |
| FR04 required-answer feedback | Native radio fieldset, submit error, focusable alert |
| FR05 save/restore | Versioned validated progress, seven-day expiry, retry and restart |
| FR06 relevant benefits | `/benefits/`, preferred tool and familiarity content |
| FR07 M2 context | makeHandoff, browser-local transfer, configurable safe signup route |
| FR08 referral attribution | Validated URL ref, local seven-day attribution |
| FR09 optional sharing | `/share/`, clipboard/manual copy and optional Web Share |
| FR10 A/B hook | Optional A/B CTA copy with persistent assignment |
| FR11 M5 events / M1-06 | **Blocked on X-02**; local default-off CustomEvent prototype, no backend delivery |
| FR12 privacy/storage | `/privacy/`, honest persistence notices and clear action |
| FR13 funnel documentation | This map, integration notes and test record; supplied diagrams remain references |
| FR14 reusable design system | Shared components, icons and CSS tokens |

## Supplied screen states

1. Landing → `/`
2. Onboarding entry → `/onboarding/`, no saved answers
3–5. Questions → `/onboarding/`, three sequential states
6. Benefits → `/benefits/`
7. Sharing → `/share/`
8. Resume → `/onboarding/`, valid saved answers
9. Required-answer error → submit without selecting an answer
10. Save failure → storage notice and retry; current answers remain in memory
11. Completion / signup boundary → `/signup-preview/`
12. Link copied → `/share/`, successful copy state

## Implementation choices needing shared review

Seven-day local retention, a 30-minute signup context, three proposed questions, a same-origin handoff and disabled-by-default event/experiment adapters are documented defaults for this frontend contribution. They are not described as previously approved team decisions. Original diagrams and reports have not been edited. Module 6 score UI is outside the requested Module 01 scope.

## Guide-ID follow-up — 20 November 2026

- **M1-05:** partial onboarding now has a desktop top-edge exit reminder after a saved answer, suppressed on storage errors and completed journeys. Native dialog Escape/button dismissal returns focus; it is claimed once per mounted marketing provider, including internal route visits. Refresh starts a new visit. No unload blocker, mobile exit detection or analytics event is added. Its eligibility model is tested; browser focus/trigger acceptance remains owed.
- **Social proof:** the landing page includes truthful project provenance and links to the public source and privacy notice. No testimonials, ratings, user counts or safety guarantees are invented.
- **M1-06:** **blocked on X-02**. The default-off `CustomEvent` hook is not analytics delivery. Referral attribution/sharing and experiments remain local prototypes.
- Documentation convention: top-level `M1-FRONTEND.md` is the module entry guide; lowercase `m1/` holds supporting implementation records, matching M6's arrangement.

| Round-2 item | Resolution / remaining boundary |
| --- | --- |
| E#38 | Current main merged; full checks rerun; old M4 blocker resolved. Cached dependency limitation is explicit in verification. |
| E#39 | Shared pin/engine change withdrawn; inherited settings retained. M3 model/static/build scope is recorded, browser rerun is not claimed. |
| E#40 | Shared Node 22 types deliberately deferred to setup-owner review. |
| E#41 | M3 home-route/integration notes synchronized; historical verification preserved with dated addendum. |
| E#42 | Desktop partial-journey reminder added, once per mounted provider visit; eligibility test passed, browser regression added but unrun. |
| E#43 | Truthful student-project provenance/source/privacy band added; no invented endorsements. |
| E#44 | M1-06 explicitly blocked on X-02; DOM prototype is not delivery. |
| E#45 | Referral/sharing remains a local prototype pending transport agreement. |
| E#46 | Conditional M1 model/event step added to shared CI; browser acceptance still owed. |
| E#47 | Entry-guide/support-directory naming convention documented above. |
