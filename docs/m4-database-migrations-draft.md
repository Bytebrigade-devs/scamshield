# M4 — checker database migrations (applied 23 November 2026)

**Status: APPLIED — 23 November 2026.** Revisions **0001 rev 6**, **0002 rev 5** were applied to the authoritative project, in order, after the M2 base schema. The verification script (**rev 5**) has **not** been run anywhere; its block 13 has never executed. Nothing in this repository carries a key or a service-role credential.

| Apply fact | Value |
|---|---|
| Date | 23 November 2026 |
| Applied by | the owner, acting as the reassigned schema steward (decision D1) |
| Project | `https://gcqfwynvtjjokndpturf.supabase.co` — **the authoritative ref.** It is the ref the deployed app reads, proven live: an expired subscription created only in this project produced a `403` on the deployed checker (23 Nov) |
| Order | `docs/m2-schema.sql` → `0001` rev 6 → `0002` rev 5, each whole file, by exact filename |
| Objects created | **9 tables** (`subscriptions` + the 8 M4 tables) and **12 functions** (7 transaction + 5 helpers: `m4_utf16_units`, `m4_valid_highlights`, `m4_valid_limitations`, `m4_valid_opaque_id`, and the trigger function `m4_history_matches_parent`), plus 5 policies and 1 trigger |
| Rows | every table empty after the apply and after the live checks (`Content-Range: */0`) |
| Verification result | **The verify script has not been run.** Live behaviour was exercised separately: atomic save, the history↔parent trigger, the unique-history and verdict-less refusals, RLS as a real `authenticated` JWT, and direction-(c) deletion — all in the M4 workspace record for 23 November |
| First attempt | failed at `REVOKE ALL ON public.m4_utf16_units(text)` (`42601`, five statements missing the `FUNCTION` keyword); the file's `BEGIN…COMMIT` rolled it back with nothing left behind, and rev 6 applied cleanly |

**Second project ref in circulation:** `xegqsshpvteizvsfzkiz` appears in M2's local environment. It is **not** this target, and its contents are unverified — it may hold the accounts behind M2's earlier live-validation claims, which would need re-basing rather than deletion. Record the ref in one place only: this table.

These files are published so the schema steward can review them from a permanent link (originally requested by Prashnidha on 20 Nov; the steward role moved to the M4 owner on 22 Nov — see [`m4-steward-reassignment-20261122.md`](m4-steward-reassignment-20261122.md)). **Current revision: 0001 rev 6, 0002 rev 5, verification script rev 5** — the steward's 21 Nov review, her answers, Lahiru's 22 Nov review plus static re-check, and the 23 Nov apply-time syntax fix are incorporated. All three files are byte-identical to the owner workspace (SHA-256 compared).

| File | Contents |
|---|---|
| [`supabase/drafts/M4-checker-migration-0001-draft.sql`](../supabase/drafts/M4-checker-migration-0001-draft.sql) | **Rev 6 (applied).** Eight snake_case tables: checks, findings, usage counters/reservations, history, feedback, dashboard usage events — bounded lengths, `bigint` counters, `UNIQUE(check_id)` + history↔parent trigger, parent-expiry reads, uuid ids for non-check tables, JSON element validators, `limit_count` (NULL = unconfigured = refuse), distinct-bucket guard, `outcome_status`, RLS enabled and forced, helper/table/schema privileges granted to `service_role`, indexes on the reservation bucket FKs. Rev 6 adds only the missing `FUNCTION` keyword to five `REVOKE` statements |
| [`supabase/drafts/M4-checker-migration-0002-functions-draft.sql`](../supabase/drafts/M4-checker-migration-0002-functions-draft.sql) | **Rev 5 (applied).** Seven transaction functions: save / reserve / settle / mark-reconciliation / finalize-reconciliation / delete / purge — limit-enforcing reserve with allowance/window refresh before admission, subject-advisory-lock ordering (no reserve×delete cycle), cumulative budget cap (`spent + reserved + new`), advisory-lock duplicate safety, validate-before-mutate settlement, null-status rejection, subject-checked replays, direction-(c) deletion, `service_role`-only execute |
| [`supabase/drafts/M4-checker-migration-verify.sql`](../supabase/drafts/M4-checker-migration-verify.sql) | **Verification script, not a migration (rev 5, not yet run).** Assertions for the applied schema — `SET LOCAL ROLE service_role` + a `current_user` guard so it cannot run as `postgres`: limit refusal, at-limit denial, duplicate-key idempotency (with a NULL guard), cumulative budget cap, budget-exceeded refusal, different-subject replay, malformed budget, downgrade refresh, exactly-once settlement, reconciliation finalisation, direction-(c) deletion, and (rev 5) **currency immutability**. It ends in `ROLLBACK`, so running it against a live project leaves nothing — not even the cleanup — instead of committing. The save/history/RLS paths need a provisioned test auth user and a separate check |

**Apply instruction:** apply `M4-checker-migration-0001-draft.sql` then `M4-checker-migration-0002-functions-draft.sql`, **by exact filename**. The verification script is not part of the apply.

## Review asks

Answered by the steward on 21 November 2026 (recorded as 21 Nov decisions, not 19 Nov requirements):

1. **Column names/types/limits** — confirmed, with budget key bounded to 64; identifiers count characters; uuid columns keep their native type.
2. **Quota semantics** — only completed checks consume quota; limited/unavailable release. Reserve now enforces the trusted limits under the bucket locks and refuses when a limit is NULL.
3. **UTF-16 snippet subtlety** — 280 UTF-16 code units, enforced by the helper.
4. **Events scope** — the nine-field revision (`subject_ref`, agreed) stays a later, separately reviewed migration; the events table accepts only `0.1.0-draft` until then.
5. **Dashboard read access + 30-day purge** — still proposed, not approved.

Still open for the reviewer: the `outcome_status` column name (kept, with a comment), the `limit_count` refresh-on-reserve behaviour (now refreshed **before** admission), and the conservative settlement of an unresolved charge at account deletion (confirmed correct by Lahiru, 22 Nov).

## Independent review — 22 November 2026

Lahiru reviewed revision 3 (`100559b`) and raised four SQL changes, two verification-script changes and five smaller items. All are incorporated in rev 4 / rev 4 / verify rev 3:

- `limit_count` and both `period_end` values now refresh under the bucket locks **before** the admission test; the budget `limit_amount` and window refresh too.
- **Every accounting function takes a subject-scoped advisory lock first** (reserve/settle/mark/finalize/delete), so all accounting for one subject is serialised. Revision 3's reservation-first delete order removed the settle/mark cycle but left a reserve×delete bucket-order cycle; the subject lock closes it. Settle/mark/finalize read the subject unlocked, lock it, then re-lock and re-check the reservation row.
- A `request_key` replay for a different subject returns `NULL`.
- Malformed budget input returns `NULL` instead of raising.
- `m4_delete_subject` takes `p_now`; explicit `service_role` table grants added; indexes added on the reservation bucket FKs.
- The verification script now uses `IS DISTINCT FROM` and an explicit replay NULL guard — the previous duplicate-key assertion could pass **vacuously** when the regression it targets occurred. It also runs `SET LOCAL ROLE service_role` with a `current_user` guard, so it cannot be run as `postgres` and skip the privilege checks.

## Static re-check — 22 November 2026

Lahiru re-checked `f619c96` (comment only, review decision unchanged at the time) and confirmed all six original items. Four items remained; all are fixed in 0002 rev 5 / verify rev 4:

- **Budget cap is cumulative** — admission now uses `spent_amount + reserved_amount + new > limit_amount`. Revision 4 ignored settled spend, so cumulative spend could pass the period cap.
- **Assertions added** — cumulative budget cap, budget-exceeded refusal, different-subject replay, malformed budget, and `limit_count` refresh after a downgrade; each goes red without its fix.
- **Contract consistency** — a daily/allowance bucket collision returns `NULL` instead of raising.
- **Currency is immutable** per `(budget_key, period_start)`; a different currency is refused, not silently refreshed.
- **Apply notes recorded** — explicit `GRANT USAGE ON SCHEMA public` for `service_role`; `m4_purge_expired` takes no subject lock and is accepted: it deletes only expired checks by key, touches no accounting row, and concurrent deletes are safe under row locks.

The verifier is still a proposal; no SQL has been executed and no database has been contacted.

**Call order (wiring, not SQL):** `m4_delete_subject` must run **before** the `auth.users` row is deleted. Delete the user first, and the checks cascade while the text-keyed quota buckets survive — nothing is settled and the counters are orphaned.

**Deletion boundary (0.1.0-draft):** `m4_delete_subject` removes the subject's checks, findings, history, feedback, quota buckets and reservations, but **not** `checker_usage_events` rows (they carry no `subject_ref` yet). Those belong to the 0.2.0 migration and Suraji's privacy answer; do not read a deletion as a full purge of every user-linked row.

## Ownership and next steps

- **Steward:** **Svishwa (M4 owner / project manager)** — reassigned 22 Nov 2026 (manager decision; Prashni remains the design author). Applies the reviewed migrations.
- **Reviewer:** **Lahiru (M2)** — independent schema review requested 22 Nov 2026, because the author and the steward are now the same person. Review scope: naming, limits, lock order, `outcome_status`, and the direction-(c) deletion logic.
- **Access / project — CHANGED 23 Nov 2026 (supersedes the fresh-project decision below):** the owner applies on the **existing** `scamshield-shared-dev` project. The 22 Nov "fresh Supabase project" decision was taken before the 23 Nov Vercel deployment, and no provisioning or invitation is owed. Order: `docs/m2-schema.sql` → `supabase/drafts/M4-checker-migration-0001-draft.sql` (revision 6) → `…-0002-functions-draft.sql` → the verify script, each by exact filename. **The project reference is deliberately not written here** — it is recorded in the M4 workspace apply record; the repository holds no ref, and `xegqsshpvteizvsfzkiz` and `gcqfwynvtjjokndpturf` have both been in circulation (Lahiru, 23 Nov 2026).
- **Target:** 22 November 2026 was conditional and **slipped**; review and access were still open on that date. **Applied 23 November 2026** by the owner/steward; see the M4 workspace apply record for the verified outcome.
- **Review status:** Prashni's 21 Nov review and Lahiru's 22 Nov re-check were **static** readings. Lahiru's 23 Nov carry-overs: the verify script had **never been executed** anywhere, and the currency-immutability rule had **no assertion** — both addressed by verify-script revision 5 (block 13).
- **M4's next dependency:** once the reviewed migrations are applied, M4 implements the Supabase adapter behind the existing `persistence-port` and runs the live end-to-end entitlement/history test.

## Sources (authoritative, in the owner workspace)

- Steward design reply, 19 Nov 2026 — `evidence/M4-prashni-db-design-reply-20261119.md`
- Team approval, 19 Nov 2026 — `evidence/M4-team-approval-20261119.md`
- M2-J access rule, 18 Nov 2026 — `evidence/M4-lahiru-m2-reply-20261118.md` (M4 owns history/feedback; RLS on; own-row reads incl. read-only after expiry; no browser writes; server-only service-role writes)
- App contract — `code/boundary/persistence-port.ts`
