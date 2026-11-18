# M4 — risk level and reason highlights (M4-06 / M4-09), 17 November 2026

**Status:** additive validated display metadata in the library. **No UI rendering, no network, no AI call, no new dependency.**

## What this adds

| Change | Behaviour |
|---|---|
| `RiskLevel` (`low` / `suspicious` / `high` / `undetermined`) | Presentation-only band from the provider reply; invalid or absent → `undetermined`; never a probability or a local-rule verdict |
| `ReasonHighlight` (`start`, `end`, `excerpt`) | Bounded exact excerpts from the AI `reason`; at most 4 candidates; first occurrence; overlaps merged; combined emphasis capped at 35% of the reason; absent/invented excerpts dropped |
| `ValidatedReply` | Now carries `riskLevel` and `reasonHighlights` (additive) |
| Tests | `reason-highlights.test.ts` (10) + updated `check-boundary.test.ts` expectations + `pipeline-x13.test.ts` (5) |

## Safety behaviour

- Highlights are **quotations from the AI's own explanation**, never from the submitted message; invented text is never displayed.
- Malformed highlight metadata never invalidates a usable reply and never rewrites the explanation; it simply becomes an empty list.
- A reply without a reason has no highlights. Optional metadata cannot turn an invalid reply into a successful one.
- No raw message text, sender data, contacts or fabricated evidence is added to the reply.

## Verification

- `node src/lib/scam-checker/boundary/reason-highlights.test.ts` → **10/10 pass**
- `node src/lib/scam-checker/boundary/pipeline-x13.test.ts` → **5/5 pass**
- `node src/lib/scam-checker/boundary/check-boundary.test.ts` → **27/27 pass** (expectations updated for the additive fields)
- full repository library suite → **243/243 pass** (16 files)
- CI: ubuntu + windows

## Limits

- This is **not** an approved verdict schema (OD-M4-04 open); it is display metadata validation.
- No highlighting UI is built here; the browser renderers remain workspace-only.
- Highlight energy/coverage thresholds are presentation parameters, not accuracy claims.
