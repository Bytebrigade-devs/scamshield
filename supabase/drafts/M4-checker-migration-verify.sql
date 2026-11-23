-- ============================================================================
-- M4 AI Scam Checker — migration verification script (for the schema steward)
-- ============================================================================
-- PURPOSE: turn the steward's "successful testing" precondition into something
--   checkable. Run this AFTER applying 0001 (revision 6) and 0002 (revision 5)
--   to the applied project (or a scratch one), **as the `service_role`**, not as `postgres`.
--   Running it as `postgres` bypasses the privilege checks, so it would pass even
--   when `service_role` lacks the table rights the functions need. Every block
--   raises on failure; the whole script is one transaction, so a failure rolls
--   back and leaves nothing behind. On success it prints nothing and commits a
--   cleanup.
--
--   REVISION 2 — 22 November 2026: replaced every `<>` assertion with
--   `IS DISTINCT FROM` and added an explicit NULL guard on the replay, because a
--   NULL comparison does not raise and would let the duplicate-request-key
--   regression pass silently.
--
--   REVISION 3 — 22 November 2026: SET LOCAL ROLE service_role plus a
--   current_user guard, so the script cannot be run as postgres and silently
--   skip the privilege checks the service_role grants exist to prove.
--
--   REVISION 4 — 22 November 2026: adds assertions for the revision-5 fixes and
--   for the four items in Lahiru's static re-check: cumulative budget spend,
--   budget-exceeded refusal, different-subject replay, malformed budget, and
--   limit_count refresh after a downgrade. Each block goes red without its fix.
--
--   REVISION 5 — 23 November 2026: adds block 13, currency immutability per
--   (budget_key, period_start). Lahiru's 23 November carry-over noted that 0002
--   enforces the rule (a different currency returns NULL, never a silent rewrite
--   of stored spend) but nothing here asserted it. Also notes 0001 at revision 6
--   (a syntax fix, no semantic change), and switches the final COMMIT to
--   ROLLBACK so the script is safe to run against the applied project.
--
-- STATUS: NOT YET EXECUTED. No run against any project exists as of 23 Nov 2026.
--   The script ends in ROLLBACK (revision 5), so it can be run against the
--   applied project without leaving anything behind — not even its cleanup.
--   A green run and a red run both leave the project exactly as they found it;
--   the assertions fire before the end of the transaction either way.
--
-- SCOPE: the quota / reservation / reconciliation / deletion accounting paths,
--   which need no auth.users row. The m4_save_check / history-trigger / RLS
--   paths require a provisioned test auth user and are NOT covered here — run
--   those separately once a test user exists.
--
-- Each test uses its own subject key so bucket counts stay isolated.
-- ============================================================================

BEGIN;

-- Run as service_role so the privilege checks are real. Running as postgres
-- bypasses them and would pass even if the service_role grants were missing.
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'FAIL 0: run this script as service_role, not %', current_user;
  END IF;
END $$;

-- 1. A NULL (unconfigured) limit must refuse admission, never allow unlimited.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.m4_reserve_check('verify-s-null', 'v-null', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', NULL,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF r IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: NULL daily limit must refuse admission';
  END IF;
END $$;

-- 2. Limit enforcement + duplicate request-key idempotency (daily limit 1).
DO $$
DECLARE r1 jsonb; r2 jsonb; replay jsonb; cnt bigint;
BEGIN
  r1 := public.m4_reserve_check('verify-s-cap', 'v-cap-1', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 1,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF r1 IS NULL THEN
    RAISE EXCEPTION 'FAIL 2a: first reservation under daily limit 1 must be admitted';
  END IF;

  r2 := public.m4_reserve_check('verify-s-cap', 'v-cap-2', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 1,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF r2 IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2b: second reservation must be refused at daily limit 1';
  END IF;

  replay := public.m4_reserve_check('verify-s-cap', 'v-cap-1', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 1,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF replay IS NULL OR (replay->>'id') IS DISTINCT FROM (r1->>'id') THEN
    RAISE EXCEPTION 'FAIL 2c: duplicate request key must return the same reservation (replay=%)', replay;
  END IF;

  SELECT reserved_count INTO cnt FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-cap' AND period_kind = 'daily';
  IF cnt IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL 2d: duplicate request must not double-reserve (got %)', cnt;
  END IF;
END $$;

-- 3. Completed settlement consumes quota exactly once.
DO $$
DECLARE rid uuid; ok boolean; cc bigint; rc bigint;
BEGIN
  rid := (public.m4_reserve_check('verify-s-settle', 'v-settle', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL))->>'id';

  ok := public.m4_settle_reservation(rid, 'completed', NULL, now());
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3a: completed settlement must succeed'; END IF;
  ok := public.m4_settle_reservation(rid, 'completed', NULL, now());
  IF ok THEN RAISE EXCEPTION 'FAIL 3b: settlement must be exactly once'; END IF;

  SELECT completed_count, reserved_count INTO cc, rc FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-settle' AND period_kind = 'monthly';
  IF cc IS DISTINCT FROM 1 OR rc IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL 3c: expected completed=1 reserved=0, got % / %', cc, rc;
  END IF;
END $$;

-- 4. Limited settlement releases the unit without consuming quota.
DO $$
DECLARE rid uuid; ok boolean; cc bigint; rc bigint;
BEGIN
  rid := (public.m4_reserve_check('verify-s-limited', 'v-limited', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL))->>'id';

  ok := public.m4_settle_reservation(rid, 'limited', NULL, now());
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4a: limited settlement must succeed'; END IF;

  SELECT completed_count, reserved_count INTO cc, rc FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-limited' AND period_kind = 'monthly';
  IF cc IS DISTINCT FROM 0 OR rc IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL 4b: limited must not consume quota (got % / %)', cc, rc;
  END IF;
END $$;

-- 5. Uncertain spend is refused before mutation, then reconciled and finalised.
DO $$
DECLARE rid uuid; ok boolean; rc bigint; spent numeric; reserved numeric; st text;
BEGIN
  rid := (public.m4_reserve_check('verify-s-recon', 'v-recon', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget','period_start',date_trunc('month', now()),
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',15,'reserved_amount',0.05)))->>'id';

  -- No reported charge on a limited result: refused, and nothing mutated.
  ok := public.m4_settle_reservation(rid, 'limited', NULL, now());
  IF ok THEN RAISE EXCEPTION 'FAIL 5a: uncertain spend must be refused'; END IF;
  SELECT reserved_count INTO rc FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-recon' AND period_kind = 'monthly';
  IF rc IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FAIL 5b: refused settlement must not mutate quota'; END IF;

  -- Reconciliation settles quota now (limited releases); spend stays open.
  ok := public.m4_mark_reconciliation(rid, 'limited', now());
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5c: reconciliation mark must succeed'; END IF;
  SELECT reserved_count INTO rc FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-recon' AND period_kind = 'monthly';
  IF rc IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL 5d: quota must be settled at mark time'; END IF;

  -- Finalisation closes only the spend at a known amount.
  ok := public.m4_finalize_reconciliation(rid, 0.03, now());
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5e: finalisation must succeed'; END IF;
  SELECT spent_amount, reserved_amount INTO spent, reserved FROM public.checker_budget_buckets
    WHERE budget_key = 'verify-budget';
  IF spent IS DISTINCT FROM 0.03 OR reserved IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL 5f: expected spent=0.03 reserved=0, got % / %', spent, reserved;
  END IF;
  SELECT state INTO st FROM public.checker_usage_reservations WHERE id = rid;
  IF st IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'FAIL 5g: finalised limited reservation must be released'; END IF;
  ok := public.m4_finalize_reconciliation(rid, 0.03, now());
  IF ok THEN RAISE EXCEPTION 'FAIL 5h: finalisation must be exactly once'; END IF;
END $$;

-- 6. A NULL status must be rejected, not silently release the reservation.
DO $$
DECLARE rid uuid; ok boolean; st text;
BEGIN
  rid := (public.m4_reserve_check('verify-s-nullstatus', 'v-nullstatus', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL))->>'id';
  ok := public.m4_settle_reservation(rid, NULL, NULL, now());
  IF ok THEN RAISE EXCEPTION 'FAIL 6a: NULL status must be rejected'; END IF;
  SELECT state INTO st FROM public.checker_usage_reservations WHERE id = rid;
  IF st IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'FAIL 6b: NULL status must not change state'; END IF;
END $$;

-- 7. Account deletion, direction (c): resolve charges, remove user-linked
--    quota/reservations, retain non-user-linked budget totals.
DO $$
DECLARE u uuid := '00000000-0000-0000-0000-0000000000d1';
        rid uuid; counts jsonb; bucket_exists boolean; spent numeric;
BEGIN
  rid := (public.m4_reserve_check(u::text, 'v-del', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget-del','period_start',date_trunc('month', now()),
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',15,'reserved_amount',0.05)))->>'id';
  PERFORM public.m4_settle_reservation(rid, 'completed', NULL, now());

  counts := public.m4_delete_subject(u);
  IF (counts->>'reservations')::int IS DISTINCT FROM 1 OR (counts->>'quota_buckets')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FAIL 7a: expected 1 reservation and 2 buckets removed, got %', counts;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.checker_quota_buckets WHERE subject_key = u::text) INTO bucket_exists;
  IF bucket_exists IS TRUE THEN RAISE EXCEPTION 'FAIL 7b: user-linked quota buckets must be removed'; END IF;
  SELECT spent_amount INTO spent FROM public.checker_budget_buckets WHERE budget_key = 'verify-budget-del';
  IF spent IS DISTINCT FROM 0.05 THEN RAISE EXCEPTION 'FAIL 7c: non-user-linked spend total must be retained'; END IF;
END $$;

-- 8. Settled spend counts against the budget cap (cumulative, not per-call).
DO $$
DECLARE r jsonb; rid uuid; spent numeric; reserved numeric;
BEGIN
  r := public.m4_reserve_check('verify-s-budget-cap', 'v-budget-cap-1', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget-cap','period_start',date_trunc('month', now()),
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',0.10,'reserved_amount',0.06));
  IF r IS NULL THEN RAISE EXCEPTION 'FAIL 8a: first budget reservation must be admitted'; END IF;
  rid := (r->>'id')::uuid;
  IF NOT public.m4_settle_reservation(rid, 'completed', NULL, now()) THEN
    RAISE EXCEPTION 'FAIL 8b: settlement of the budget reservation must succeed';
  END IF;

  -- spent_amount is now 0.06; another 0.06 would exceed the 0.10 period cap.
  r := public.m4_reserve_check('verify-s-budget-cap', 'v-budget-cap-2', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget-cap','period_start',date_trunc('month', now()),
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',0.10,'reserved_amount',0.06));
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL 8c: settled spend must count against the budget cap'; END IF;

  SELECT spent_amount, reserved_amount INTO spent, reserved FROM public.checker_budget_buckets
    WHERE budget_key = 'verify-budget-cap';
  IF spent IS DISTINCT FROM 0.06 OR reserved IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL 8d: a refused reservation must not mutate the budget (spent=% reserved=%)', spent, reserved;
  END IF;
END $$;

-- 9. A request_key replay cannot return another subject's reservation.
DO $$
DECLARE r1 jsonb; r2 jsonb; cnt bigint;
BEGIN
  r1 := public.m4_reserve_check('verify-s-replay-a', 'v-replay-shared', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF r1 IS NULL THEN RAISE EXCEPTION 'FAIL 9a: first subject must be admitted'; END IF;

  r2 := public.m4_reserve_check('verify-s-replay-b', 'v-replay-shared', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF r2 IS NOT NULL THEN RAISE EXCEPTION 'FAIL 9b: a replay must not return another subject reservation'; END IF;

  SELECT count(*) INTO cnt FROM public.checker_usage_reservations WHERE request_key = 'v-replay-shared';
  IF cnt IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FAIL 9c: refused replay must not add a reservation (got %)', cnt; END IF;
  SELECT count(*) INTO cnt FROM public.checker_quota_buckets WHERE subject_key = 'verify-s-replay-b';
  IF cnt IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL 9d: refused replay must not create buckets'; END IF;
END $$;

-- 10. Malformed budget input returns NULL and creates nothing.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.m4_reserve_check('verify-s-badbudget', 'v-badbudget', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget-bad','period_start','not-a-timestamp',
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',15,'reserved_amount',0.05));
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL 10a: malformed budget must return NULL'; END IF;
  IF EXISTS (SELECT 1 FROM public.checker_budget_buckets WHERE budget_key = 'verify-budget-bad') THEN
    RAISE EXCEPTION 'FAIL 10b: malformed budget must not create a bucket';
  END IF;
END $$;

-- 11. A reservation above the budget is refused; limit_amount = 0 allows no spend.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.m4_reserve_check('verify-s-budget-over', 'v-budget-over', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget-over','period_start',date_trunc('month', now()),
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',0.05,'reserved_amount',0.06));
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL 11a: a reservation above the budget must be refused'; END IF;

  r := public.m4_reserve_check('verify-s-budget-zero', 'v-budget-zero', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60,
    jsonb_build_object('budget_key','verify-budget-zero','period_start',date_trunc('month', now()),
      'period_end',date_trunc('month', now()) + interval '1 month','currency','USD',
      'limit_amount',0,'reserved_amount',0.01));
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL 11b: limit_amount = 0 must refuse any spend'; END IF;
END $$;

-- 12. A refused request still refreshes the stored limit (downgrade visibility).
DO $$
DECLARE r jsonb; lc bigint;
BEGIN
  r := public.m4_reserve_check('verify-s-downgrade', 'v-downgrade-1', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 60, NULL);
  IF r IS NULL THEN RAISE EXCEPTION 'FAIL 12a: first reservation must be admitted'; END IF;

  r := public.m4_reserve_check('verify-s-downgrade', 'v-downgrade-2', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 0,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 0, NULL);
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL 12b: zero limits must refuse admission'; END IF;

  SELECT limit_count INTO lc FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-downgrade' AND period_kind = 'daily';
  IF lc IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL 12c: a refused request must still refresh limit_count (got %)', lc;
  END IF;
END $$;

-- 13. Currency is immutable per (budget_key, period_start): a different currency
--     refuses admission, and the stored currency is never rewritten. 0002 enforces
--     this; without this block the rule had no assertion (Lahiru, 23 Nov 2026).
DO $$
DECLARE
  r   jsonb;
  ccy text;
BEGIN
  r := public.m4_reserve_check('verify-s-currency', 'v-currency-1', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 10,
    jsonb_build_object('budget_key', 'verify-budget-ccy',
      'period_start', date_trunc('month', now()),
      'period_end', date_trunc('month', now()) + interval '1 month',
      'currency', 'USD', 'limit_amount', 10, 'reserved_amount', 0.01));
  IF r IS NULL THEN RAISE EXCEPTION 'FAIL 13a: the first reservation with a currency must be admitted'; END IF;

  r := public.m4_reserve_check('verify-s-currency', 'v-currency-2', now(), 60000,
    date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', 5,
    'monthly', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 10,
    jsonb_build_object('budget_key', 'verify-budget-ccy',
      'period_start', date_trunc('month', now()),
      'period_end', date_trunc('month', now()) + interval '1 month',
      'currency', 'LKR', 'limit_amount', 10, 'reserved_amount', 0.01));
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL 13b: a different currency must refuse admission'; END IF;

  SELECT currency INTO ccy FROM public.checker_budget_buckets
    WHERE budget_key = 'verify-budget-ccy' AND period_start = date_trunc('month', now());
  IF ccy IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'FAIL 13c: the stored currency must stay USD (got %)', ccy;
  END IF;
END $$;

-- Cleanup: every artefact this script creates carries a verify-* key, so a run that
-- commits still leaves nothing behind. The script ends in ROLLBACK, so in practice
-- even this cleanup is undone — belt and braces for a shared project.
DELETE FROM public.checker_usage_reservations WHERE subject_key LIKE 'verify-s-%' OR subject_key = '00000000-0000-0000-0000-0000000000d1';
DELETE FROM public.checker_quota_buckets WHERE subject_key LIKE 'verify-s-%' OR subject_key = '00000000-0000-0000-0000-0000000000d1';
DELETE FROM public.checker_budget_buckets WHERE budget_key IN ('verify-budget', 'verify-budget-del', 'verify-budget-cap', 'verify-budget-bad', 'verify-budget-over', 'verify-budget-zero', 'verify-budget-ccy');

-- ROLLBACK, not COMMIT (revision 5, 23 November 2026). The assertions all fire
-- inside this transaction, so nothing is lost by undoing it — and running the
-- script against the applied project then leaves the database exactly as it was
-- found, which COMMIT could not promise for any pre-existing verify-* rows.
ROLLBACK;

-- ============================================================================
-- If this script reaches the end without raising, the accounted paths above hold
-- on the applied schema. Report the result with a date. The save/history/RLS paths
-- still need a provisioned test auth user and a separate check.
-- ============================================================================
