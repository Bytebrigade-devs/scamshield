# Requirements and source mapping

Primary source: combined ScamShield interim report, M6 Section 4.11, Section 4.12, Figures 70–74 and Appendix D. The report separates an earlier checklist prototype from the revised integration proposal. This frontend preserves that distinction.

| M6 requirement | Frontend implementation | Remaining server responsibility |
|---|---|---|
| FR01 personal dashboard | Overview, loading, sign-in and access-denied views | Verify session and per-user data ownership; no authentication is simulated as real |
| FR02 validate inputs | Strict view-schema parsing, allowlisted metrics, source time/version/eligibility and stale detection | Produce approved source summaries with subject binding and reviewed freshness |
| FR03 approved score | Display only an eligible approved server aggregate; default integrated view has no score | Approve and calculate the scoring model server-side; reject tampered client totals |
| FR04 explain components | Source cards, metric counts, observations, freshness deadlines, limitations and missing-data reasons | Supply truthful data and reviewed source definitions |
| FR05 next actions | Local checklist is enabled; absent cross-module destinations are disabled with reasons | Supply existing authorized destinations and retain their access checks |
| FR06 history | Timestamped, versioned synthetic history with chart/table/filter/CSV; integrated history explicitly unavailable | Persist and return approved historical snapshots without presenting them as current |
| FR07 prototype checklist | Five practices, confirmation, successful local save, 65-to-90 demonstration, review and reset | No real scoring effect is claimed |

## Embedded UI figures implemented

- Figure 70: dashboard, 65/100, breakdown 15/15 + 25/25 + 0/25 + 10/20 + 15/15 and a next action.
- Figure 71: password checklist with five practices, privacy reminder and cancel.
- Figure 72: five confirmed practices, save and review navigation.
- Figure 73: updated 90/100, 25/25 password demonstration category, review, guide and restart.
- Figure 74: demo category weights and bands 0–39, 40–69, 70–89 and 90–100.

The implementation expands the desktop layout, adds a responsive stacked mobile layout and labels synthetic values throughout. The three-source integration preview does not reuse the legacy categories as if they were an approved new formula.

## Data and privacy choices

The report’s existing prototype did not establish real persistence. This new frontend implements actual **local session-only demo persistence**, with honest failure feedback; it does not claim server persistence. Draft selections remain in memory until saved. The saved record contains five fixed practice IDs and a timestamp, not passwords or real account data. Synthetic historical dates are relative fixtures, not observations of a user.

The API view schema, exact endpoint and optional server-display conditions are new draft frontend contracts for team review. They do not claim that the original M2/M3/M4 producer contracts have been accepted. No migrations, formula approval, signatures or account creation are performed.


## Shared-app source locations

Routes: `src/app/safety-score`. Components, model, fixtures and adapter: `src/features/safety-score`. Tests: `tests/safety-score-model.test.ts` and `tests/safety-score-service.test.ts`. The existing root font and palette are reused; module CSS is scoped under `.m6-app`. Authentication and producer/scoring contract acceptance remain server/team responsibilities.
