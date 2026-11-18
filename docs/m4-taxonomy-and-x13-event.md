# M4 — taxonomy source + X-13 `m4.check_outcome` event (15 November 2026)

**Status:** M4-local implementation, no transport wiring. The eight-field event is **built and validated**, not emitted anywhere (no queue, emitter, dedup or exactly-once claim).

## What this slice adds

| File | Purpose |
|---|---|
| `src/lib/scam-checker/boundary/taxonomy.ts` | Single source for the five X-13 category IDs, display labels and the `0.1.0-draft` taxonomy version; `normaliseCategory()` with the `unknown_other` fallback; `categoryLabel()` |
| `src/lib/scam-checker/boundary/x13-event.ts` | Pure `buildCheckOutcomeEvent()` + `validateCheckOutcomeEvent()` for the eight-field `m4.check_outcome` event |
| `src/lib/scam-checker/boundary/taxonomy.test.ts` | 9 tests: vocabulary, fallback, valid/invalid status-mode pairs, event shape, rejection of extra keys, no-network declaration |
| `src/lib/scam-checker/boundary/check-boundary.ts` | Refactored to import the taxonomy source; behaviour unchanged (a non-string category still rejects the reply; an unknown string still falls back) |

## Event rules (X-13 §4.1)

| Status | Mode | Category |
|---|---|---|
| `completed` | `rules_and_ai` | may be `unknown_other` |
| `limited` | `rules_only` | rule-supported ID or `unknown_other` |
| `unavailable` | `none` | **must** be `unknown_other` |

Exactly eight fields: `contract_version`, `event_type`, `event_id`, `occurred_at`, `taxonomy_version`, `category_id`, `analysis_status`, `analysis_mode`. No message text, snippet, contact, verdict, reason, account reference or count is allowed; additional keys are rejected.

## Verification

- `node src/lib/scam-checker/boundary/taxonomy.test.ts` → **9/9 pass**
- full repository library suite → **175/175 pass** (9 files)
- CI: ubuntu + windows on the pull request

## Limits (do not over-read)

- This is **not** a frozen shared contract; it implements M4's `0.1.0-draft` proposal.
- No consumer (M5) delivery, no retention/dedup policy, no database, no UI change.
- Category labels are display vocabulary only, never a safety or incident claim.
