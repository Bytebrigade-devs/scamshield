-- Module 2: Signup, Paywall & Subscription
-- Run in the Supabase SQL editor. Auth users live in auth.users (managed by Supabase).
-- All payments are MOCKED: no card data is stored, only the plan and status.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('Sentinel', 'Guardian', 'Aegis')),
  status text not null check (status in ('active', 'trialing', 'cancelled')),
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  started_at timestamptz not null default now(),
  renews_at timestamptz,
  cancelled_at timestamptz
);

alter table public.subscriptions enable row level security;

create policy "own subscription: select" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "own subscription: insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);

create policy "own subscription: update" on public.subscriptions
  for update using (auth.uid() = user_id);
