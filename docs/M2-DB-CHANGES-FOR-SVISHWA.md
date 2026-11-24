# M2 database design — final handoff (for Svishwa)

**From:** Lahiru Achintha, M2 owner · **To:** Svishwa (@Svishwa2004), project Supabase owner
**Source:** branch `feat/m2-subscription-helper` · **Status:** SQL is complete in this branch and
validated against PostgreSQL 16 locally; **it has not been applied to the Supabase project yet.**

> Scope: M2 owns the subscription and simulated-payment objects only. No M3/M4/M5/M6 table is
> created, altered or read by this work.

## 1. Apply in this order

| Step | File | Creates |
|---|---|---|
| 1 | `docs/m2-schema.sql` | `public.subscriptions` (+ checks, RLS, grants) |
| 2 | `docs/m2-test-payments.sql` | `public.m2_test_cards`, `public.m2_test_payments`, `public.m2_pay_test_subscription(...)` |

Both files run inside a single transaction, are safe to re-run, and end with verification queries.
Step 2 depends on the Supabase built-in `auth.users` table and on step 1's table.

`docs/m2-schema.sql` is the same interim migration already published on
`feat/m2-signup-paywall`, copied here so this branch is a self-contained package.
`docs/m2-test-payments.sql` is new in this branch.

Nothing else changes. Auth settings (Site URL, redirect URLs, email delivery) are dashboard
configuration, not SQL.

## 2. `public.subscriptions` — final

| Column | Type | Null | Default | Rule |
|---|---|---|---|---|
| `user_id` | `uuid` | no | — | PK; FK `auth.users(id)` `on delete cascade` |
| `plan` | `text` | no | — | `sentinel` / `guardian` / `aegis` |
| `status` | `text` | no | — | `trialing` / `active` / `cancelled` / `past_due` / `suspended` |
| `billing_cycle` | `text` | yes | — | `monthly` / `quarterly` / `yearly`; null only for a trial |
| `started_at` | `timestamptz` | no | `now()` | trial anchored at account creation; purchase = payment time |
| `renews_at` | `timestamptz` | yes | — | **entitlement expiry**, not auto-renewal |
| `cancelled_at` | `timestamptz` | yes | — | set on cancel; access survives until `renews_at` |

Constraints:

- `subscriptions_entitlement_check` — `renews_at > started_at`; a trial must be `sentinel` with
  `billing_cycle is null`; an `active` row must have a cycle.
- `subscriptions_plan_check`, `subscriptions_status_check`, `subscriptions_billing_cycle_check`.

Access:

- RLS enabled, one policy `own subscription: select` (`auth.uid() = user_id`).
- `anon` and `authenticated` have **all** privileges revoked (including insert/update/delete);
  `authenticated` then regains `select` only.
- `service_role` has all privileges. Only server routes write.

Semantics: one row per user, no history table; `renews_at` is the only expiry source.
`past_due`/`suspended` cannot be produced or cleared by M2's API. `docs/m2-schema.sql` aborts if
pre-existing plans outside the three ids exist (legacy Free/Premium) — deliberate, see section 9.

---

## 3. `public.m2_test_cards` — final

One row per synthetic card. Balances are shared by every user of that card.

| Column | Type | Null | Rule |
|---|---|---|---|
| `card_id` | `text` | no | PK, `^[0-9]{4}$` |
| `method` | `text` | no | `debit_card` / `credit_card` |
| `balance` | `bigint` | no | `>= 0`, LKR minor units |
| `created_at` | `timestamptz` | no | default `now()` |
| `updated_at` | `timestamptz` | no | default `now()`; updated on each debit |

Seeded fixtures (match `src/lib/test-cards.ts`):

| card_id | method | starting balance | purpose |
|---|---|---:|---|
| `4242` | debit_card | 20,000,000 | normal success |
| `4444` | credit_card | 20,000,000 | normal success, credit path |
| `0002` | debit_card | 400 | deliberate insufficient-funds |

The seed is `on conflict (card_id) do nothing`, so re-running the migration never resets balances.

## 4. `public.m2_test_payments` — final

Append-only simulated ledger; one row per successful checkout.

| Column | Type | Null | Rule |
|---|---|---|---|
| `transaction_id` | `uuid` | no | PK, default `gen_random_uuid()`; returned to the client |
| `user_id` | `uuid` | yes | FK `auth.users(id)` `on delete set null`; null only after account deletion |
| `card_id` | `text` | no | FK `m2_test_cards(card_id)` |
| `request_id` | `uuid` | no | **unique** client retry key |
| `plan` | `text` | no | `sentinel` / `guardian` / `aegis` |
| `billing_cycle` | `text` | no | `monthly` / `quarterly` / `yearly` |
| `amount` | `bigint` | no | `> 0`, LKR minor units, derived server-side |
| `period_start` | `timestamptz` | no | start of the entitlement period granted |
| `period_end` | `timestamptz` | no | `> period_start`; equals the `subscriptions.renews_at` written in the same transaction |
| `created_at` | `timestamptz` | no | default `now()` |

Indexes: `(user_id, created_at desc)` for account history and `(card_id)` for the FK.

Why `period_start`/`period_end` exist: they tie each synthetic payment to the exact window it
bought, so a later audit does not have to trust the current subscription row. They are never
returned by the API.

No PAN, expiry or security code column exists — the route never accepts or forwards them.

---

## 5. `public.m2_pay_test_subscription(...)` — final

```sql
m2_pay_test_subscription(
  p_user_id uuid, p_card_id text, p_plan text, p_cycle text, p_request_id uuid
) returns jsonb
```

Called by `POST /api/subscription` with the service-role client. Results:

| `kind` | Route | When |
|---|---|---|
| `paid` | 200 `{ subscription, transactionId }` | writes committed, or an identical replay of a recorded request id |
| `declined` | 402 | fixture balance below the price |
| `blocked` | 403 | current status `suspended` / `past_due` |
| `conflict` | 409 | retry key reused with different purchase data, a live paid plan, or a losing race |
| `invalid` | 400 | null/unknown user, card, plan or cycle; any constraint violation |

Order of work inside the function:

1. Reject nulls, unknown plan/cycle, and a `p_user_id` with no `auth.users` row → `invalid`.
2. Derive the price (never accepted from the caller).
3. `pg_advisory_xact_lock(hashtextextended(user_id))` — serializes this user's purchases.
4. Replay lookup by `request_id`: identical data → `paid` with the original `transactionId`;
   different data → `conflict`. No second debit.
5. Lock and check the current subscription: blocked → `blocked`; live `active`/`cancelled`
   (expiry in the future) → `conflict`; an unexpired trial or an expired row may be replaced.
6. Lock the card row `for update`; unknown → `invalid`; insufficient → `declined`.
7. Period = calendar month(s): monthly +1, quarterly +3, yearly +12 (month-end clamped by
   PostgreSQL, matching `billingEnd` in `src/lib/entitlement.ts`).
8. Upsert the subscription as `active`, debit the card, insert the ledger row — one transaction.
   Any failure rolls all three back.

Price map (keep in sync with `src/lib/plans.ts`, LKR):

| plan | monthly | quarterly | yearly |
|---|---:|---:|---:|
| sentinel | 490 | 1320 | 4900 |
| guardian | 990 | 2670 | 9900 |
| aegis | 1990 | 5370 | 19900 |

Security: `security definer`, `set search_path = public, pg_temp`; `revoke all ... from public,
anon, authenticated`; `grant execute ... to service_role` only. The file's verification query must
report `authenticated_can_execute = false`.

---

## 6. Deliberate boundaries

- **No real gateway, webhook or invoice.** Payments are simulated by project requirement.
- **No card data.** Only synthetic 4-digit fixture ids are stored; there is nowhere to put a PAN,
  expiry or CVV even if a client sent one.
- **No renewal job.** Nothing extends `renews_at` automatically; the user must buy again.
- **No plan change while a paid entitlement is live.** The function returns `conflict`, matching the
  UI, which hides plan changes for a valid paid subscription.
- **No usage ledger.** M2 returns limits from `evaluateEntitlement`; M4 enforces them. M2 counts
  nothing and stores no check history.
- **No subscription history table.** One current row per user; `m2_test_payments` is the only
  historical record and it is payment-shaped, not entitlement-shaped.
- **No backfill flag.** The optional flag mentioned in `docs/M2-BACKEND.md` is intentionally not
  implemented: no caller sends it, its date/debit semantics were never agreed, and there are no
  pre-schema paid rows to backfill. Add it later as a separately reviewed migration if needed.
- **No M3/M4/M5/M6 objects.** This work cannot break another module's data.

## 7. Validation performed

Both files were executed against **PostgreSQL 16** (PGlite, in-process), with stubs for
`auth.users` and `auth.uid()` and the three Supabase roles, followed by 26 assertions. All passed:

- paid: correct `kind`, `active` row, exact 490 debit, one-calendar-month period, ledger row whose
  `period_end` equals the subscription's `renews_at`;
- replay of a request id: same `transactionId`, no second debit; altered replay → `conflict`;
- live paid plan change → `conflict`; card `0002` → `declined` with no subscription or ledger write;
- unknown card/plan/cycle/user → `invalid`; `suspended` → `blocked`;
- trial → paid upgrade; expired paid row → successful replacement;
- RLS on both payment tables, no read/insert for `authenticated`; function is `security definer`,
  `authenticated` cannot execute it, `service_role` can;
- re-running the whole payment migration keeps balances and the ledger intact.

**Not covered by that test:** Supabase's real `auth.users`, PostgREST RPC dispatch, dashboard
settings, or network/RLS behaviour with real JWTs. The live checks below are still required.

## 8. Verification after applying

The files already end with these queries; expect `rls_enabled = true` on all three tables, every
`authenticated_can_* = false`, `security_definer = true`, `authenticated_can_execute = false`:

```sql
select c.relname, c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_can_insert
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('subscriptions', 'm2_test_cards', 'm2_test_payments');

select p.proname, p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'm2_pay_test_subscription';
```

Then, with two real test accounts:

1. Sign up, confirm email, log in, start the one-time trial, cancel, confirm access survives until
   `renews_at`, then confirm a second `PUT` returns 409.
2. Confirm account A cannot read account B's row, and that a direct `insert`/`update`/`delete`
   from an anon or authenticated client is denied.
3. Checkout: a `success` purchase returns a `transactionId`; repeating the same `requestId` returns
   the same id with no second debit; card `0002` returns 402; a live plan change returns 409.

---

## 9. Open decisions (not mine to make alone)

| # | Decision | Owner |
|---|---|---|
| 1 | Legacy `Free`/`Premium` rows: migrate to a new plan id, or delete and let those users re-subscribe? `docs/m2-schema.sql` aborts until this is agreed. | schema steward + manager |
| 2 | Name the schema steward for the shared schema (still unnamed in `docs/m4-team-update-20261115.md`). | M3 / Prashni, or manager |
| 3 | M4's durable history/feedback/usage tables — M2 does not own them; retention (30/90/180 days), RLS scoping and field names are unagreed. | M4 + steward |
| 4 | Confirm the backfill flag is not needed. If it is, define whether it debits a card and which dates it records, then add it as a separate migration. | M2 + steward |
| 5 | Whether M2 should ever persist a usage ledger. Today limits are returned to callers and enforced by M4. | M2 + M4 |

## 10. Rollback

Applied in dependency order; the ledger is destroyed by step 2, so export it first if it matters:

```sql
drop function if exists public.m2_pay_test_subscription(uuid, text, text, text, uuid);
drop table if exists public.m2_test_payments;
drop table if exists public.m2_test_cards;
drop table if exists public.subscriptions;
```

Reverting the M2 routes to the commit before `feat/m2-subscription-helper` removes the code that
uses these objects. Nothing in this work alters `auth.*`, RLS on other tables, or any
M3/M4/M5/M6 object.