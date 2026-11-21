# ScamShield M2 Database Plan

## Purpose

Persist each account's plan and entitlement so the server can decide whether the user may access ScamShield checks. Module 2 owns authentication and subscription state. Module 4 owns usage counting and atomic quota enforcement.

## Database choice

- Use Supabase Auth for account identity and PostgreSQL for subscription records.
- Reference `auth.users(id)` as the authoritative account ID.
- Keep the subscription table in the `public` schema and enforce one row per user.
- Keep payment processing simulated. Do not store card numbers, security codes, or payment credentials.

## M2 table

`public.subscriptions` stores:

| Column | Purpose |
| --- | --- |
| `user_id` | Primary key and foreign key to `auth.users(id)`; deleting the account deletes its subscription row. |
| `plan` | `sentinel`, `guardian`, or `aegis`. |
| `status` | `trialing`, `active`, `cancelled`, `past_due`, or `suspended`. |
| `billing_cycle` | `monthly`, `quarterly`, `yearly`, or `null` for a trial. |
| `started_at` | Server-recorded start time. |
| `renews_at` | Entitlement expiry time; it does not indicate automatic renewal. |
| `cancelled_at` | Cancellation time, or `null` when not cancelled. |

The schema constrains valid plans, statuses, and billing cycles. It also requires expiry after start, a Sentinel plan and no billing cycle for trials, and a billing cycle for active paid plans.

## Access control

1. Enable row-level security on `public.subscriptions`.
2. Allow authenticated users to select only their own row using `auth.uid() = user_id`.
3. Revoke browser insert, update, and delete privileges. Do not add user-facing write policies.
4. Perform writes through trusted Next.js API routes after verifying the Supabase access token. Use `SUPABASE_SERVICE_ROLE_KEY` on the server only.
5. Derive user ID, entitlement status, and expiry on the server. Never trust those values from browser request bodies.

## Trial and plan behavior

- A registered account can allocate one seven-day trial, anchored to the Auth signup timestamp.
- Trial allowance metadata is 15 total successful checks and up to 5 checks per day.
- Paid plans store their plan, billing cycle, and server-derived expiry. Checkout remains simulated.
- Cancellation records `cancelled_at` and preserves access only until the existing expiry.
- The server denies access at or after expiry and for suspended or past-due states.

## Usage data boundary

M2 returns plan limits as entitlement metadata but does not maintain check counters. Module 4 should own the usage ledger and atomically enforce trial-total, daily, monthly, and rate limits before calling a model. Count successful completed checks only. Keep provider budgets and checker history separate from subscription state.

## Rollout steps

1. Have the schema steward review `docs/m2-schema.sql`, including its deliberate abort when legacy Free/Premium rows exist. Agree on any required migration before applying it.
2. Apply the reviewed SQL to the development Supabase project. `docs/m2-new-project-setup.sql` is a fresh-project setup alternative; use one reviewed path, not both blindly.
3. Configure email/password Auth, the app's Site URL and redirect allowlist, and custom SMTP for ordinary user email delivery.
4. Configure the Supabase URL, anon key, and server-only service role key in the app environment. Never commit `.env.local` or expose the service role key to browser code.
5. Verify with two test accounts that each can read only their own subscription and neither can write subscription rows directly from the browser.
6. Exercise trial creation, duplicate-trial rejection, expiry boundaries, mock checkout, cancellation, suspended/past-due denial, and service/database failure behavior.
7. Coordinate Module 4 integration so every protected check uses the server entitlement helper and M4's atomic usage enforcement.

## Current status

The branch contains the M2 schema and server-side subscription routes. The schema is applied in the Supabase development project (seven columns, RLS enabled, one row; owner-verified 19 November 2026); Auth email delivery, account isolation and Module 4 quota enforcement still need verification there. Changes are on `feat/m2-sync-main`, synced with `main`, and submitted as PR #46. A second migration draft, `docs/m2-billing-schema-draft.sql` (kept out of `supabase/drafts/`, which holds M4's drafts), adds the billing columns and `public.subscription_payments`; it is not applied. Usage counters stay with M4, whose draft is `supabase/drafts/M4-checker-migration-0001-draft.sql` (`checker_quota_buckets`, `checker_usage_events`); M2 exposes limits only and stores no counters.

## Related files

- `docs/m2-schema.sql` — rerunnable interim schema/migration with a legacy-row guard.
- `docs/m2-new-project-setup.sql` — fresh-project schema setup and basic privilege check.
- `docs/M2-BACKEND.md` — environment setup, API contract, and backend limitations.
- `src/lib/subscription-server.ts` — verified user and subscription context.
- `src/lib/entitlement.ts` — server-side access and limit decisions.
- `src/app/api/subscription/route.ts` — subscription read/write routes.
