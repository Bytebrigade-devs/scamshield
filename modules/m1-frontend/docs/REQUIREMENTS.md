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
| FR11 M5 events | Optional allowlisted CustomEvent adapter; no backend delivery |
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
11. Completion / signup boundary → `/signup/`
12. Link copied → `/share/`, successful copy state

## Implementation choices needing shared review

Seven-day local retention, a 30-minute signup context, three proposed questions, a same-origin handoff and disabled-by-default event/experiment adapters are documented defaults for this standalone delivery. They are not described as previously approved team decisions. Original diagrams and reports have not been edited. Module 6 score UI is outside the requested Module 01 scope.
