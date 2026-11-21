-- ============================================================================
-- M2 Signup, Paywall and Subscription - billing metadata and simulated payment history (DRAFT)
-- ============================================================================
-- STATUS: DRAFT for schema-steward review. NOT applied. No column or table in this file
--   exists in any database. The applied base schema is docs/m2-schema.sql; this draft must be
--   applied after it, and the guard below aborts when that table is missing.
--
-- SCOPE: records the amount charged, the currency, the payment-method enum and the explicit
--   no-auto-renew rule on public.subscriptions, plus one row per simulated charge in
--   public.subscription_payments. It deliberately stores NO card number, expiry, security code,
--   provider reference or gateway payload - there are no such columns.
--
-- USAGE COUNTERS: not here. M4 owns the ledger - see
--   supabase/drafts/M4-checker-migration-0001-draft.sql (checker_quota_buckets,
--   checker_usage_events, checker_usage_reservations). M2 exposes limits only.
-- ============================================================================
begin;

-- Fail loudly instead of half-applying when the base M2 table is missing.
do $$ begin
  if to_regclass('public.subscriptions') is null then
    raise exception 'Apply docs/m2-schema.sql before docs/m2-billing-schema.sql.';
  end if;
end $$;

-- 1. What the current period was charged, and how. Prices historically lived only in code.
alter table public.subscriptions
  add column if not exists price_lkr integer,
  add column if not exists currency text not null default 'LKR',
  add column if not exists payment_method text,
  add column if not exists auto_renew boolean not null default false;

alter table public.subscriptions drop constraint if exists subscriptions_billing_fields_check;
alter table public.subscriptions add constraint subscriptions_billing_fields_check check (
  currency = 'LKR'
  and (price_lkr is null or price_lkr >= 0)
  and (payment_method is null or payment_method in ('debit_card', 'credit_card'))
  -- Mock payments never renew; the column exists so the product rule is explicit in data.
  and auto_renew = false
  -- A trial has no charge and no payment method.
  and (billing_cycle is not null or (price_lkr is null and payment_method is null))
);

-- 2. One row per simulated charge: the invoice/audit trail the subscriptions row cannot hold.
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  billing_cycle text not null,
  amount_lkr integer not null,
  currency text not null default 'LKR',
  payment_method text not null,
  status text not null default 'succeeded',
  simulated boolean not null default true,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint subscription_payments_plan_check check (plan in ('sentinel', 'guardian', 'aegis')),
  constraint subscription_payments_cycle_check check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  constraint subscription_payments_method_check check (payment_method in ('debit_card', 'credit_card')),
  constraint subscription_payments_amount_check check (amount_lkr >= 0 and currency = 'LKR'),
  constraint subscription_payments_honest_check check (status = 'succeeded' and simulated),
  constraint subscription_payments_period_check check (period_end > period_start)
);

create index if not exists subscription_payments_user_created_idx
  on public.subscription_payments (user_id, created_at desc);

alter table public.subscription_payments enable row level security;
drop policy if exists "own payments: select" on public.subscription_payments;
create policy "own payments: select" on public.subscription_payments
  for select to authenticated using (auth.uid() = user_id);

-- Same rule as the subscriptions table: the browser may read its own rows and nothing else.
revoke all on public.subscription_payments from anon, authenticated;
grant select on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;

commit;
