# M4 — checker database migrations (DRAFT for steward review)

**Status: DRAFT — NOT APPLIED.** No table, policy or function in these files exists in any database. Team approval (19 Nov 2026) authorises drafting only; applying needs the named implementer plus Supabase access, and deployment stays separately gated.

These two files are published so the schema steward can review them from a permanent link (originally requested by Prashnidha on 20 Nov; the steward role moved to the M4 owner on 22 Nov — see [`m4-steward-reassignment-20261122.md`](m4-steward-reassignment-20261122.md)):

| File | Contents |
|---|---|
| [`supabase/drafts/M4-checker-migration-0001-draft.sql`](../supabase/drafts/M4-checker-migration-0001-draft.sql) | Eight snake_case tables: checks, findings, usage counters/reservations, history, feedback, dashboard usage events, and supporting constraints — CHECK vocabularies, composite ownership foreign keys, a UTF-16 snippet helper, RLS enabled and forced |
| [`supabase/drafts/M4-checker-migration-0002-functions-draft.sql`](../supabase/drafts/M4-checker-migration-0002-functions-draft.sql) | Six transaction functions: save / reserve / settle / reconcile / delete / purge |

## Review asks (flagged for the steward)

1. **Draft-reconstructed column names/types.** Where the steward's recorded column list was not captured verbatim, M4's proposal is marked `[draft]` in-file and must be confirmed or renamed by her.
2. **Quota semantics.** Only completed checks consume quota; limited/unavailable release their reservation (per `code/boundary/persistence-port.ts`). The counter functions must match.
3. **UTF-16 snippet subtlety.** History snippets cap at 280 UTF-16 code units, not bytes/graphemes; the helper and column types must agree.
4. **Events scope.** The nine-field event revision (`subject_ref`, now an agreed name) is **deliberately not in this migration**; adding it is a later, separately reviewed migration. The events table keeps the current eight fields and is service-role-only in this draft pending M5/M6 consumer review.
5. **Dashboard read access + 30-day purge** are proposed in the draft, not approved.

## Ownership and next steps

- **Steward:** **Svishwa (M4 owner / project manager)** — reassigned 22 Nov 2026 (manager decision; Prashni remains the design author). Reviews these drafts, then applies the reviewed migrations.
- **Access:** Lahiru (M2) arranges the correct Supabase project access — requested for Prashni's account, now to be re-routed to the steward's.
- **Target:** 22 November 2026 was conditional and has **slipped**; both preconditions (review, access) were still open on that date.
- **M4's next dependency:** once the reviewed migrations are applied, M4 implements the Supabase adapter behind the existing `persistence-port` and runs the live end-to-end entitlement/history test.

## Sources (authoritative, in the owner workspace)

- Steward design reply, 19 Nov 2026 — `evidence/M4-prashni-db-design-reply-20261119.md`
- Team approval, 19 Nov 2026 — `evidence/M4-team-approval-20261119.md`
- M2-J access rule, 18 Nov 2026 — `evidence/M4-lahiru-m2-reply-20261118.md` (M4 owns history/feedback; RLS on; own-row reads incl. read-only after expiry; no browser writes; server-only service-role writes)
- App contract — `code/boundary/persistence-port.ts`
