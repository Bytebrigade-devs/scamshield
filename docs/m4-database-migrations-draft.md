# M4 — checker database migrations (DRAFT for steward review)

**Status: DRAFT — NOT APPLIED.** No table, policy or function in these files exists in any database. Team approval (19 Nov 2026) authorises drafting only; applying needs the named implementer plus Supabase access, and deployment stays separately gated.

These files are published so the schema steward can review them from a permanent link (originally requested by Prashnidha on 20 Nov; the steward role moved to the M4 owner on 22 Nov — see [`m4-steward-reassignment-20261122.md`](m4-steward-reassignment-20261122.md)). **Current revision: 0001 rev 3, 0002 rev 2** — the steward's 21 Nov review and answers are incorporated. All three files are byte-identical to the owner workspace (SHA-256 compared).

| File | Contents |
|---|---|
| [`supabase/drafts/M4-checker-migration-0001-draft.sql`](../supabase/drafts/M4-checker-migration-0001-draft.sql) | **Rev 3.** Eight snake_case tables: checks, findings, usage counters/reservations, history, feedback, dashboard usage events — bounded lengths, `bigint` counters, `UNIQUE(check_id)` + history↔parent trigger, parent-expiry reads, uuid ids for non-check tables, JSON element validators, `limit_count` (NULL = unconfigured = refuse), distinct-bucket guard, `outcome_status`, RLS enabled and forced, helper `EXECUTE` granted to `service_role` |
| [`supabase/drafts/M4-checker-migration-0002-functions-draft.sql`](../supabase/drafts/M4-checker-migration-0002-functions-draft.sql) | **Rev 2.** Seven transaction functions: save / reserve / settle / mark-reconciliation / finalize-reconciliation / delete / purge — limit-enforcing reserve, advisory-lock duplicate safety, one lock order, validate-before-mutate settlement, null-status rejection, direction-(c) deletion, `service_role`-only execute |
| [`supabase/drafts/M4-checker-migration-verify.sql`](../supabase/drafts/M4-checker-migration-verify.sql) | **Verification script, not a migration.** Assertions for the steward to run on a scratch project after applying: limit refusal, at-limit denial, duplicate-key idempotency, exactly-once settlement, reconciliation finalisation, direction-(c) deletion. The save/history/RLS paths need a provisioned test auth user and a separate check |

**Apply instruction:** apply `M4-checker-migration-0001-draft.sql` then `M4-checker-migration-0002-functions-draft.sql`, **by exact filename**. The verification script is not part of the apply.

## Review asks

Answered by the steward on 21 November 2026 (recorded as 21 Nov decisions, not 19 Nov requirements):

1. **Column names/types/limits** — confirmed, with budget key bounded to 64; identifiers count characters; uuid columns keep their native type.
2. **Quota semantics** — only completed checks consume quota; limited/unavailable release. Reserve now enforces the trusted limits under the bucket locks and refuses when a limit is NULL.
3. **UTF-16 snippet subtlety** — 280 UTF-16 code units, enforced by the helper.
4. **Events scope** — the nine-field revision (`subject_ref`, agreed) stays a later, separately reviewed migration; the events table accepts only `0.1.0-draft` until then.
5. **Dashboard read access + 30-day purge** — still proposed, not approved.

Still open for the reviewer: the `outcome_status` column name, the `limit_count` refresh-on-reserve behaviour, and the conservative settlement of an unresolved charge at account deletion.

## Ownership and next steps

- **Steward:** **Svishwa (M4 owner / project manager)** — reassigned 22 Nov 2026 (manager decision; Prashni remains the design author). Applies the reviewed migrations.
- **Reviewer:** **Lahiru (M2)** — independent schema review requested 22 Nov 2026, because the author and the steward are now the same person. Review scope: naming, limits, lock order, `outcome_status`, and the direction-(c) deletion logic.
- **Access / project:** Lahiru (M2) arranges a **fresh Supabase project** (owner decision, 22 Nov 2026) and invites the steward's account with SQL rights. On a fresh project the M2 base schema must be applied before these drafts.
- **Target:** 22 November 2026 was conditional and has **slipped**; review, access and testing were still open on that date.
- **M4's next dependency:** once the reviewed migrations are applied, M4 implements the Supabase adapter behind the existing `persistence-port` and runs the live end-to-end entitlement/history test.

## Sources (authoritative, in the owner workspace)

- Steward design reply, 19 Nov 2026 — `evidence/M4-prashni-db-design-reply-20261119.md`
- Team approval, 19 Nov 2026 — `evidence/M4-team-approval-20261119.md`
- M2-J access rule, 18 Nov 2026 — `evidence/M4-lahiru-m2-reply-20261118.md` (M4 owns history/feedback; RLS on; own-row reads incl. read-only after expiry; no browser writes; server-only service-role writes)
- App contract — `code/boundary/persistence-port.ts`
