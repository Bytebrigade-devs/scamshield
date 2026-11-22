-- ============================================================================
-- M4 AI Scam Checker — migration verification script (for the schema steward)
-- ============================================================================
-- PURPOSE: turn the steward's "successful testing" precondition into something
--   checkable. Run this AFTER applying 0001 (revision 3) and 0002 (revision 2)
--   to a SCRATCH Supabase project, as service_role. Every block raises on
--   failure; the whole script is one transaction, so a failure rolls back and
--   leaves nothing behind. On success it prints nothing and commits a cleanup.
--
-- STATUS: NOT executed by M4. No database was contacted to produce this file.
--   It is a proposal for the steward to run; M4 cannot run it without access.
--
-- SCOPE: the quota / reservation / reconciliation / deletion accounting paths,
--   which need no auth.users row. The m4_save_check / history-trigger / RLS
--   paths require a provisioned test auth user and are NOT covered here — run
--   those separately once a test user exists.
--
-- Each test uses its own subject key so bucket counts stay isolated.
-- ============================================================================

BEGIN;

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
  IF (replay->>'id') <> (r1->>'id') THEN
    RAISE EXCEPTION 'FAIL 2c: duplicate request key must return the same reservation';
  END IF;

  SELECT reserved_count INTO cnt FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-cap' AND period_kind = 'daily';
  IF cnt <> 1 THEN
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
  IF cc <> 1 OR rc <> 0 THEN
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
  IF cc <> 0 OR rc <> 0 THEN
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
  IF rc <> 1 THEN RAISE EXCEPTION 'FAIL 5b: refused settlement must not mutate quota'; END IF;

  -- Reconciliation settles quota now (limited releases); spend stays open.
  ok := public.m4_mark_reconciliation(rid, 'limited', now());
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5c: reconciliation mark must succeed'; END IF;
  SELECT reserved_count INTO rc FROM public.checker_quota_buckets
    WHERE subject_key = 'verify-s-recon' AND period_kind = 'monthly';
  IF rc <> 0 THEN RAISE EXCEPTION 'FAIL 5d: quota must be settled at mark time'; END IF;

  -- Finalisation closes only the spend at a known amount.
  ok := public.m4_finalize_reconciliation(rid, 0.03, now());
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5e: finalisation must succeed'; END IF;
  SELECT spent_amount, reserved_amount INTO spent, reserved FROM public.checker_budget_buckets
    WHERE budget_key = 'verify-budget';
  IF spent <> 0.03 OR reserved <> 0 THEN
    RAISE EXCEPTION 'FAIL 5f: expected spent=0.03 reserved=0, got % / %', spent, reserved;
  END IF;
  SELECT state INTO st FROM public.checker_usage_reservations WHERE id = rid;
  IF st <> 'released' THEN RAISE EXCEPTION 'FAIL 5g: finalised limited reservation must be released'; END IF;
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
  IF st <> 'reserved' THEN RAISE EXCEPTION 'FAIL 6b: NULL status must not change state'; END IF;
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
  IF (counts->>'reservations')::int <> 1 OR (counts->>'quota_buckets')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 7a: expected 1 reservation and 2 buckets removed, got %', counts;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.checker_quota_buckets WHERE subject_key = u::text) INTO bucket_exists;
  IF bucket_exists THEN RAISE EXCEPTION 'FAIL 7b: user-linked quota buckets must be removed'; END IF;
  SELECT spent_amount INTO spent FROM public.checker_budget_buckets WHERE budget_key = 'verify-budget-del';
  IF spent <> 0.05 THEN RAISE EXCEPTION 'FAIL 7c: non-user-linked spend total must be retained'; END IF;
END $$;

-- Cleanup: remove every verification artefact so the scratch project is left clean.
DELETE FROM public.checker_usage_reservations WHERE subject_key LIKE 'verify-s-%' OR subject_key = '00000000-0000-0000-0000-0000000000d1';
DELETE FROM public.checker_quota_buckets WHERE subject_key LIKE 'verify-s-%' OR subject_key = '00000000-0000-0000-0000-0000000000d1';
DELETE FROM public.checker_budget_buckets WHERE budget_key IN ('verify-budget', 'verify-budget-del');

COMMIT;

-- ============================================================================
-- If this script commits without raising, the accounted paths above hold on the
-- applied schema. Report the result with a date. The save/history/RLS paths
-- still need a provisioned test auth user and a separate check.
-- ============================================================================
