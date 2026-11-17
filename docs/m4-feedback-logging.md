# M4 — feedback logging (M4-07), 17 November 2026

**Status:** in-memory library slice. **No database, no network, no UI control, no training.** The trigger and fields are owner-decided; the persistence layer and UI wiring remain gated.

## What this adds

`src/lib/scam-checker/feedback-store.ts` (+ `feedback-store.test.ts`, 10 tests):

| Piece | Behaviour |
|---|---|
| Trigger | `wrong_result` only — the explicit **“Report a wrong result”** action |
| Fields | `subjectKey`, `checkId`, `category`, `reasonCode`, `createdAt` (+ opaque `id`, `trigger`) |
| Idempotency | one record per (subject, check); re-reporting replaces it, never duplicates a count |
| Deletion | `deleteAll(subjectKey)` for account deletion / user request |
| Validation | opaque check id 1–128 without whitespace; category from the X-13 taxonomy; reason code `^[a-z][a-z0-9_]{0,63}$`; finite positive timestamp; bounded subject id |

## Deliberate limits

- **No message text, snippet or rating field exists**, and there is no “confirmed scam”/training ground truth. The tests pin that rejected fields are ignored.
- **In-memory only**: restart forgets; no cross-instance claim.
- **Feedback retention is still open** (OD-M4-05/07): no automatic expiry in this slice; only explicit deletion.
- The reason-code **vocabulary** is still to be agreed; only a bounded code format is enforced.
- No UI change: the “Report a wrong result” control is not built here.

## Verification

- `node src/lib/scam-checker/feedback-store.test.ts` → **10/10 pass**
- repository library suite → **219/219 pass** (13 files)
