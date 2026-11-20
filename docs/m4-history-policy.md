# M4 — history read policy + in-memory store (15 November 2026)

**Status:** M4-local library slice. **No database, no Supabase, no network, no live entitlement.** In-memory only — a restart forgets everything, and it is not cross-instance.

## What this adds

`src/lib/scam-checker/boundary/history-store.ts` (+ `history-store.test.ts`):

| Piece | Behaviour |
|---|---|
| `RETENTION_DAYS_BY_PLAN` | Sentinel 30 · Guardian 90 · Aegis 180 · trial 30 (documented assumption) |
| `retentionDaysFor` / `retentionMsFor` | Known plan/trial → window; unknown → null (caller must not save) |
| `historyReadAccess(snapshot, now)` | `full` while entitled (active/trial/cancelled-before-expiry) · `read-only` after it ends, including suspended/past_due · `none` without a verified snapshot |
| `createInMemoryHistoryStore()` | `save` (validates subject/plan/time/snippet ≤280/verdict/category) · `list` (newest first, excludes expired) · `deleteOne` · `deleteAll` · `purgeExpired` |

## Policy implemented (team-agreed, owner-reported, 15 Nov 2026)

- Retention = the plan window (30/90/180 days); records are deleted after it.
- Users can delete one record or all of their own history; account deletion removes all of that subject's rows.
- After a subscription ends, retained records remain **read-only** until retention ends; new checks are still blocked by the boundary, not by this module.
- Subject isolation is enforced: one subject can never read or delete another subject's records.

## Verification

- `node src/lib/scam-checker/boundary/history-store.test.ts` → **11/11 pass**
- full repository library suite → **186/186 pass** (10 files)
- CI: ubuntu + windows

## Limits (do not over-read)

- **Snippet only**: max 280 chars, caller-minimised; over-length rejected, never truncated; there is no full-message field.
- Retention boundary is strict (exactly at the window = expired); plan windows are tested.
- Trial retention inherits Sentinel's 30 days pending a trial-specific rule.
- A durable store (Supabase/DB) must implement the same policy later; this slice makes no persistence or deletion guarantee.
