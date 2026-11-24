-- M2 mock payment schema and the service-only checkout function.
-- Review with the schema steward, then apply AFTER docs/m2-schema.sql.
-- All payments are simulated: only synthetic card ids, plan ids and amounts are stored.
-- No card number, expiry or security code is accepted or stored.
--
-- Scope: the optional backfill flag mentioned in docs/M2-BACKEND.md is deliberately NOT
-- implemented here. No caller sends it, its date/debit semantics were never agreed, and M2 has
-- no pre-schema paid rows to backfill. Add it as a separate reviewed migration if it is needed.
--
-- Re-running is safe: tables are created only if missing, constraints are re-asserted,
-- and fixture balances are inserted only when the card row does not exist (never reset).
begin;

create table if not exists public.m2_test_cards (
  card_id    text primary key,
  method     text not null,
  balance    bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.m2_test_cards drop constraint if exists m2_test_cards_card_id_check;
alter table public.m2_test_cards add constraint m2_test_cards_card_id_check check (card_id ~ '^[0-9]{4}$');
alter table public.m2_test_cards drop constraint if exists m2_test_cards_method_check;
alter table public.m2_test_cards add constraint m2_test_cards_method_check check (method in ('debit_card','credit_card'));
alter table public.m2_test_cards drop constraint if exists m2_test_cards_balance_check;
alter table public.m2_test_cards add constraint m2_test_cards_balance_check check (balance >= 0);

create table if not exists public.m2_test_payments (
  transaction_id uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  card_id        text not null references public.m2_test_cards(card_id),
  request_id     uuid not null unique,
  plan           text not null,
  billing_cycle  text not null,
  amount         bigint not null,
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  created_at     timestamptz not null default now()
);

alter table public.m2_test_payments drop constraint if exists m2_test_payments_plan_check;
alter table public.m2_test_payments add constraint m2_test_payments_plan_check check (plan in ('sentinel','guardian','aegis'));
alter table public.m2_test_payments drop constraint if exists m2_test_payments_cycle_check;
alter table public.m2_test_payments add constraint m2_test_payments_cycle_check check (billing_cycle in ('monthly','quarterly','yearly'));
alter table public.m2_test_payments drop constraint if exists m2_test_payments_amount_check;
alter table public.m2_test_payments add constraint m2_test_payments_amount_check check (amount > 0);
alter table public.m2_test_payments drop constraint if exists m2_test_payments_period_check;
alter table public.m2_test_payments add constraint m2_test_payments_period_check check (period_end > period_start);

create index if not exists m2_test_payments_user_created_idx
  on public.m2_test_payments (user_id, created_at desc);
create index if not exists m2_test_payments_card_idx
  on public.m2_test_payments (card_id);

-- Fixtures mirror TEST_CARDS and TEST_CARD_STARTING_BALANCES in src/lib/test-cards.ts.
-- Balance is in LKR minor units and is shared by every user of that synthetic card.
insert into public.m2_test_cards (card_id, method, balance) values
  ('4242', 'debit_card',  20000000),
  ('4444', 'credit_card', 20000000),
  ('0002', 'debit_card',  400)
on conflict (card_id) do nothing;

alter table public.m2_test_cards enable row level security;
alter table public.m2_test_payments enable row level security;
-- No policies on purpose: authenticated browsers get nothing; the service role bypasses RLS.
revoke all on public.m2_test_cards, public.m2_test_payments from anon, authenticated;
grant all on public.m2_test_cards, public.m2_test_payments to service_role;
-- Price map: keep in sync with PLANS in src/lib/plans.ts. The caller never sends an amount;
-- this function derives it and is the only writer of subscriptions for a purchase.
create or replace function public.m2_pay_test_subscription(
  p_user_id    uuid,
  p_card_id    text,
  p_plan       text,
  p_cycle      text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_amount  bigint;
  v_card    public.m2_test_cards%rowtype;
  v_current public.subscriptions%rowtype;
  v_payment public.m2_test_payments%rowtype;
  v_sub     public.subscriptions%rowtype;
  v_start   timestamptz := now();
  v_end     timestamptz;
begin
  if p_user_id is null or p_card_id is null or p_plan is null
     or p_cycle is null or p_request_id is null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  if p_plan not in ('sentinel', 'guardian', 'aegis')
     or p_cycle not in ('monthly', 'quarterly', 'yearly') then
    return jsonb_build_object('kind', 'invalid');
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_amount := case p_plan
    when 'sentinel' then case p_cycle when 'monthly' then 490  when 'quarterly' then 1320 else 4900  end
    when 'guardian' then case p_cycle when 'monthly' then 990  when 'quarterly' then 2670 else 9900  end
    else                 case p_cycle when 'monthly' then 1990 when 'quarterly' then 5370 else 19900 end
  end;

  -- Serialize this user's purchases so two requests cannot both replace the subscription.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Repeating a request id returns the original transaction, never a second charge.
  select * into v_payment from public.m2_test_payments where request_id = p_request_id;
  if found then
    if v_payment.user_id is distinct from p_user_id
       or v_payment.card_id is distinct from p_card_id
       or v_payment.plan is distinct from p_plan
       or v_payment.billing_cycle is distinct from p_cycle then
      return jsonb_build_object('kind', 'conflict');
    end if;
    select * into v_sub from public.subscriptions where user_id = p_user_id;
    return jsonb_build_object(
      'kind', 'paid',
      'transactionId', v_payment.transaction_id,
      'subscription', to_jsonb(v_sub)
    );
  end if;

  select * into v_current from public.subscriptions where user_id = p_user_id for update;
  if found then
    if v_current.status in ('suspended', 'past_due') then
      return jsonb_build_object('kind', 'blocked');
    end if;
    -- A live paid entitlement cannot change plan; a trial or an expired row can be replaced.
    if v_current.status in ('active', 'cancelled')
       and v_current.renews_at is not null and v_current.renews_at > now() then
      return jsonb_build_object('kind', 'conflict');
    end if;
  end if;

  select * into v_card from public.m2_test_cards where card_id = p_card_id for update;
  if not found then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if v_card.balance < v_amount then
    return jsonb_build_object('kind', 'declined');
  end if;

  v_end := v_start + case p_cycle
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    else interval '12 months'
  end;

  insert into public.subscriptions as s
    (user_id, plan, status, billing_cycle, started_at, renews_at, cancelled_at)
  values
    (p_user_id, p_plan, 'active', p_cycle, v_start, v_end, null)
  on conflict (user_id) do update
    set plan = excluded.plan,
        status = 'active',
        billing_cycle = excluded.billing_cycle,
        started_at = excluded.started_at,
        renews_at = excluded.renews_at,
        cancelled_at = null
  returning s.* into v_sub;

  update public.m2_test_cards
     set balance = balance - v_amount, updated_at = now()
   where card_id = p_card_id;

  insert into public.m2_test_payments
    (user_id, card_id, request_id, plan, billing_cycle, amount, period_start, period_end)
  values
    (p_user_id, p_card_id, p_request_id, p_plan, p_cycle, v_amount, v_start, v_end)
  returning * into v_payment;

  return jsonb_build_object(
    'kind', 'paid',
    'transactionId', v_payment.transaction_id,
    'subscription', to_jsonb(v_sub)
  );
exception
  when unique_violation then
    -- A concurrent request used the same retry key first.
    return jsonb_build_object('kind', 'conflict');
  when check_violation or not_null_violation or foreign_key_violation then
    return jsonb_build_object('kind', 'invalid');
end;
$fn$;

revoke all on function public.m2_pay_test_subscription(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.m2_pay_test_subscription(uuid, text, text, text, uuid)
  to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verification. Expect rls_enabled = true, every authenticated_* = false,
-- security_definer = true, authenticated_can_execute = false.
-- ---------------------------------------------------------------------------
select c.relname,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_can_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_can_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('m2_test_cards', 'm2_test_payments')
order by c.relname;

select p.proname,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'm2_pay_test_subscription';

select card_id, method, balance from public.m2_test_cards order by card_id;

comment on table public.m2_test_cards is 'M2 synthetic test-card fixtures. Service-role only; balances are shared per fixture and never shown to the browser.';
comment on column public.m2_test_cards.balance is 'Shared synthetic balance in LKR minor units.';
comment on table public.m2_test_payments is 'M2 simulated payment ledger. No card number, expiry or security code is stored.';
comment on column public.m2_test_payments.request_id is 'Client retry key; unique so a repeated checkout returns the original transaction.';
comment on column public.m2_test_payments.period_start is 'Start of the entitlement period granted by this simulated payment.';
comment on column public.m2_test_payments.period_end is 'Entitlement expiry granted by this payment; equals subscriptions.renews_at written in the same transaction.';
comment on function public.m2_pay_test_subscription(uuid, text, text, text, uuid) is 'Service-only mock checkout: validates plan and cycle, debits a shared test card, writes the subscription and payment atomically, and is idempotent by request id.';