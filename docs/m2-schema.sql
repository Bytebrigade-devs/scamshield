-- M2 interim schema/migration. Review with the schema steward before applying.
-- Run in Supabase SQL editor. Mock subscriptions only; no payment/card data.
begin;
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null,
  status text not null,
  billing_cycle text,
  started_at timestamptz not null default now(),
  renews_at timestamptz,
  cancelled_at timestamptz
);
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions drop constraint if exists subscriptions_billing_cycle_check;
-- Existing Free/Premium rows cannot be mapped to the newly agreed plans without a decision.
-- Abort rather than silently granting, deleting or converting existing access.
do $$ begin
  if exists (select 1 from public.subscriptions where plan not in ('sentinel','guardian','aegis')) then
    raise exception 'Legacy Free/Premium rows exist. Agree a migration with the schema steward before applying M2 interim.';
  end if;
end $$;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('sentinel','guardian','aegis'));
alter table public.subscriptions add constraint subscriptions_status_check check (status in ('trialing','active','cancelled','past_due','suspended'));
alter table public.subscriptions add constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly','quarterly','yearly'));
alter table public.subscriptions drop constraint if exists subscriptions_entitlement_check;
alter table public.subscriptions add constraint subscriptions_entitlement_check check (
  renews_at is not null and renews_at > started_at and
  (status <> 'trialing' or (billing_cycle is null and plan = 'sentinel')) and
  (status <> 'active' or billing_cycle is not null)
);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription: select" on public.subscriptions;
drop policy if exists "own subscription: insert" on public.subscriptions;
drop policy if exists "own subscription: update" on public.subscriptions;
create policy "own subscription: select" on public.subscriptions for select to authenticated using (auth.uid() = user_id);
-- Revoke browser writes even if another permissive RLS policy was previously installed.
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
commit;
