begin;
create table public.subscriptions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 plan text not null,
 status text not null,
 billing_cycle text,
 started_at timestamptz not null default now(),
 renews_at timestamptz,
 cancelled_at timestamptz,
 constraint subscriptions_plan_check check (plan in ('sentinel','guardian','aegis')),
 constraint subscriptions_status_check check (status in ('trialing','active','cancelled','past_due','suspended')),
 constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly','quarterly','yearly')),
 constraint subscriptions_entitlement_check check (
  renews_at is not null and renews_at > started_at and
  (status <> 'trialing' or (billing_cycle is null and plan = 'sentinel')) and
  (status <> 'active' or billing_cycle is not null)
 )
);
alter table public.subscriptions enable row level security;
create policy "own subscription: select" on public.subscriptions for select to authenticated using (auth.uid() = user_id);
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
commit;
select c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated', c.oid, 'INSERT') as browser_can_insert
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'subscriptions';
