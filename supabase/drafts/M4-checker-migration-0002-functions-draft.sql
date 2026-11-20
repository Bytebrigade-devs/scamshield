-- ============================================================================
-- M4 AI Scam Checker — durable persistence transaction functions (DRAFT 0002)
-- ============================================================================
-- STATUS: DRAFT for schema-steward review. NOT applied. Depends on migration 0001
--   (design/M4-checker-migration-0001-draft.sql). No function here exists in any DB.
--
-- PURPOSE: implement the atomic semantics of code/boundary/persistence-port.ts in
--   PL/pgSQL so the durable adapter can call them via the service-role client:
--     * atomic check + findings + optional history save (one transaction);
--     * idempotent reservation by request_key, locking both quota buckets (+budget);
--     * exactly-once settlement: ONLY completed consumes quota; limited/unavailable
--       release the unit; a provider charge may still settle; uncertain spend on a
--       non-completed result is refused here (caller uses reconciliation);
--     * reconciliation marker (keeps the spend reservation);
--     * subject deletion (cascades; counters NEVER reset) and expired-row purge.
--
-- CONCURRENCY: bucket rows are locked with SELECT ... FOR UPDATE inside each
--   function; callers wrap multi-statement work in a transaction. Functions are
--   SECURITY INVOKER and are intended to be called only by the server-only
--   service_role client (BYPASSRLS) after session/ownership/entitlement verification.
--
-- DRAFT NOTES: parameter shapes are M4 proposals for steward confirmation; the
--   nine-field event reference is NOT handled here (name unagreed). Validation of
--   content semantics stays app-side (persistence-port.ts); DB CHECKs (0001) enforce
--   vocabularies/limits. Nothing here is executed or deployed.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Atomic save: check + findings + optional history row, one transaction.
-- p_check / p_findings / p_history are jsonb shaped by persistence-mapping.ts.
-- Returns the check id. Raises on constraint violation (caller maps to null).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_save_check(
  p_check    jsonb,
  p_findings jsonb,
  p_history  jsonb DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_check_id text;
  v_user_id  uuid;
  f          jsonb;
BEGIN
  v_check_id := p_check->>'id';
  v_user_id  := (p_check->>'user_id')::uuid;

  INSERT INTO public.scam_checks (
    id, user_id, plan_id, created_at, expires_at, analysis_status, analysis_mode,
    category_id, taxonomy_version, verdict_label, risk_level, reason,
    reason_highlights, limitations
  ) VALUES (
    v_check_id, v_user_id, p_check->>'plan_id',
    (p_check->>'created_at')::timestamptz, (p_check->>'expires_at')::timestamptz,
    p_check->>'analysis_status', p_check->>'analysis_mode',
    p_check->>'category_id', p_check->>'taxonomy_version',
    p_check->>'verdict_label', p_check->>'risk_level', p_check->>'reason',
    COALESCE(p_check->'reason_highlights', '[]'::jsonb),
    COALESCE(p_check->'limitations', '[]'::jsonb)
  );

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_findings, '[]'::jsonb)) LOOP
    INSERT INTO public.scam_findings (
      id, check_id, user_id, rule_id, excerpt, start_offset, end_offset, context_note
    ) VALUES (
      f->>'id', v_check_id, v_user_id, f->>'rule_id', f->>'excerpt',
      (f->>'start_offset')::integer, (f->>'end_offset')::integer, f->>'context_note'
    );
  END LOOP;

  IF p_history IS NOT NULL THEN
    INSERT INTO public.checker_history (
      id, check_id, user_id, plan_id, created_at, expires_at, snippet, verdict_label, category_id
    ) VALUES (
      p_history->>'id', v_check_id, v_user_id, p_history->>'plan_id',
      (p_history->>'created_at')::timestamptz, (p_history->>'expires_at')::timestamptz,
      p_history->>'snippet', p_history->>'verdict_label', p_history->>'category_id'
    );
  END IF;

  RETURN v_check_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Idempotent reservation: reserve one unit on the daily + allowance buckets and
-- optional budget capacity. A duplicate request_key returns the existing record.
-- p_budget (nullable) = {budget_key, period_start, period_end, currency,
--                        limit_amount, reserved_amount}.
-- Returns the reservation row as jsonb.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_reserve_check(
  p_subject         text,
  p_request_key     text,
  p_now             timestamptz,
  p_lease_ms        bigint,
  p_daily_start     timestamptz,
  p_daily_end       timestamptz,
  p_allowance_kind  text,
  p_allowance_start timestamptz,
  p_allowance_end   timestamptz,
  p_budget          jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing   public.checker_usage_reservations%ROWTYPE;
  v_daily_id   text;
  v_allow_id   text;
  v_budget_id  text := NULL;
  v_res        public.checker_usage_reservations%ROWTYPE;
BEGIN
  -- Idempotent replay of the same admission key.
  SELECT * INTO v_existing FROM public.checker_usage_reservations
    WHERE request_key = p_request_key;
  IF FOUND THEN
    RETURN to_jsonb(v_existing);
  END IF;

  -- Daily bucket: create-if-absent, then lock.
  INSERT INTO public.checker_quota_buckets
    (id, subject_key, period_kind, period_start, period_end, completed_count, reserved_count, updated_at)
  VALUES (gen_random_uuid()::text, p_subject, 'daily', p_daily_start, p_daily_end, 0, 0, p_now)
  ON CONFLICT (subject_key, period_kind, period_start) DO NOTHING;
  SELECT id INTO v_daily_id FROM public.checker_quota_buckets
    WHERE subject_key = p_subject AND period_kind = 'daily' AND period_start = p_daily_start
    FOR UPDATE;
  UPDATE public.checker_quota_buckets
    SET reserved_count = reserved_count + 1, updated_at = p_now WHERE id = v_daily_id;

  -- Allowance bucket (monthly or trial): create-if-absent, then lock.
  INSERT INTO public.checker_quota_buckets
    (id, subject_key, period_kind, period_start, period_end, completed_count, reserved_count, updated_at)
  VALUES (gen_random_uuid()::text, p_subject, p_allowance_kind, p_allowance_start, p_allowance_end, 0, 0, p_now)
  ON CONFLICT (subject_key, period_kind, period_start) DO NOTHING;
  SELECT id INTO v_allow_id FROM public.checker_quota_buckets
    WHERE subject_key = p_subject AND period_kind = p_allowance_kind AND period_start = p_allowance_start
    FOR UPDATE;
  UPDATE public.checker_quota_buckets
    SET reserved_count = reserved_count + 1, updated_at = p_now WHERE id = v_allow_id;

  -- Optional provider-spend capacity.
  IF p_budget IS NOT NULL THEN
    INSERT INTO public.checker_budget_buckets
      (id, budget_key, period_start, period_end, currency, limit_amount, reserved_amount, spent_amount, updated_at)
    VALUES (
      gen_random_uuid()::text, p_budget->>'budget_key',
      (p_budget->>'period_start')::timestamptz, (p_budget->>'period_end')::timestamptz,
      p_budget->>'currency', (p_budget->>'limit_amount')::numeric, 0, 0, p_now
    )
    ON CONFLICT (budget_key, period_start) DO NOTHING;
    SELECT id INTO v_budget_id FROM public.checker_budget_buckets
      WHERE budget_key = p_budget->>'budget_key' AND period_start = (p_budget->>'period_start')::timestamptz
      FOR UPDATE;
    UPDATE public.checker_budget_buckets
      SET reserved_amount = reserved_amount + (p_budget->>'reserved_amount')::numeric, updated_at = p_now
      WHERE id = v_budget_id;
  END IF;

  INSERT INTO public.checker_usage_reservations (
    id, request_key, subject_key, daily_bucket_id, allowance_bucket_id, budget_bucket_id,
    state, reserved_amount, actual_amount, created_at, lease_expires_at, settled_at
  ) VALUES (
    gen_random_uuid()::text, p_request_key, p_subject, v_daily_id, v_allow_id, v_budget_id,
    'reserved', COALESCE((p_budget->>'reserved_amount')::numeric, 0), NULL,
    p_now, p_now + (p_lease_ms || ' milliseconds')::interval, NULL
  ) RETURNING * INTO v_res;

  RETURN to_jsonb(v_res);
END;
$$;

-- ----------------------------------------------------------------------------
-- Exactly-once settlement. completed -> consumes quota + settles spend (default
-- reserved amount, or an explicit actual). limited/unavailable -> release quota;
-- a provider charge settles only if explicitly reported, else REFUSE (caller must
-- use reconciliation for uncertain spend). Returns false if already settled or
-- invalid; true on success.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_settle_reservation(
  p_reservation_id text,
  p_status         text,
  p_actual_spend   numeric DEFAULT NULL,
  p_now            timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_res    public.checker_usage_reservations%ROWTYPE;
  v_spend  numeric;
BEGIN
  IF p_status NOT IN ('completed','limited','unavailable') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_res FROM public.checker_usage_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.state <> 'reserved' THEN
    RETURN false; -- exactly once
  END IF;

  -- Release the reserved quota unit on both buckets; completed also consumes one.
  UPDATE public.checker_quota_buckets
    SET reserved_count = GREATEST(0, reserved_count - 1),
        completed_count = completed_count + CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
        updated_at = p_now
    WHERE id IN (v_res.daily_bucket_id, v_res.allowance_bucket_id);

  -- Provider spend (if a budget bucket is attached).
  IF v_res.budget_bucket_id IS NOT NULL THEN
    IF p_status <> 'completed' AND p_actual_spend IS NULL THEN
      RETURN false; -- uncertain spend on a non-completed result: reconcile, do not guess
    END IF;
    v_spend := COALESCE(p_actual_spend, v_res.reserved_amount);
    UPDATE public.checker_budget_buckets
      SET reserved_amount = GREATEST(0, reserved_amount - v_res.reserved_amount),
          spent_amount = spent_amount + v_spend,
          updated_at = p_now
      WHERE id = v_res.budget_bucket_id;
    UPDATE public.checker_usage_reservations SET actual_amount = v_spend WHERE id = p_reservation_id;
  END IF;

  UPDATE public.checker_usage_reservations
    SET state = CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'released' END,
        settled_at = p_now
    WHERE id = p_reservation_id;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Reconciliation marker: uncertain provider cost keeps the spend reservation
-- instead of blindly releasing it. Only a still-reserved row may be marked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_mark_reconciliation(
  p_reservation_id text,
  p_now            timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT state INTO v_state FROM public.checker_usage_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_state <> 'reserved' THEN
    RETURN false;
  END IF;
  UPDATE public.checker_usage_reservations
    SET state = 'reconciliation_required', settled_at = p_now
    WHERE id = p_reservation_id;
  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Account deletion: remove the subject's checks (findings/history/feedback cascade
-- via the ownership FKs). Quota/budget counters are deliberately NOT reset.
-- Returns {checks, history, feedback} counts removed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_delete_subject(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_checks   integer;
  v_history  integer;
  v_feedback integer;
BEGIN
  SELECT count(*) INTO v_history  FROM public.checker_history  WHERE user_id = p_user;
  SELECT count(*) INTO v_feedback FROM public.checker_feedback WHERE user_id = p_user;
  DELETE FROM public.scam_checks WHERE user_id = p_user;
  GET DIAGNOSTICS v_checks = ROW_COUNT;
  RETURN jsonb_build_object('checks', v_checks, 'history', v_history, 'feedback', v_feedback);
END;
$$;

-- ----------------------------------------------------------------------------
-- Physical purge of expired checks (dependents cascade). Counters untouched.
-- Returns the number of checks removed. Scheduled invocation is a separate gate.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_purge_expired(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_removed integer;
BEGIN
  DELETE FROM public.scam_checks WHERE expires_at <= p_now;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$$;

COMMIT;

-- ============================================================================
-- NOT here (gated): the live async Supabase adapter that calls these functions
--   (the synchronous PersistencePort needs an async evolution first); event
--   purge/retention scheduling; applying any function (implementer + access).
-- ============================================================================
