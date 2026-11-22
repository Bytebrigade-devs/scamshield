-- ============================================================================
-- M4 AI Scam Checker — durable persistence transaction functions (DRAFT 0002, revision 3)
-- ============================================================================
-- STATUS: DRAFT for independent review. NOT applied. Depends on migration 0001
--   revision 4 (design/M4-checker-migration-0001-draft.sql). No function here
--   exists in any database, and nothing in this file has been executed.
--
-- REVISION 2 — 21 November 2026: implements the steward's review item 3 and her
--   follow-up answers. Changes:
--     * uuid identities throughout (0001 revision 3 uses uuid columns);
--     * reserve enforces the trusted plan limits under the bucket locks and
--       REFUSES admission when a limit is NULL (unconfigured);
--     * duplicate request keys are serialised with a transaction-scoped
--       advisory lock — FOR UPDATE cannot lock a row that does not exist yet;
--     * one lock order everywhere: daily bucket -> allowance bucket -> budget
--       bucket -> reservation row, all before mutation;
--     * settlement validates BEFORE changing any counter (RETURN does not roll
--       back, so a refused settlement must not have mutated anything);
--     * NULL/invalid statuses are rejected explicitly (NULL NOT IN (...) is
--       NULL, which would otherwise slip through the guard);
--     * reconciliation records the outcome and settles quota at mark time;
--       m4_finalize_reconciliation closes only the provider spend, so nothing
--       is double-counted;
--     * account deletion follows direction (c): resolve outstanding
--       reservations/charges, then remove the subject's user-linked quota
--       buckets and reservations; non-user-linked budget totals are retained.
--       PENDING Suraji's privacy confirmation and team awareness.
--
-- CONCURRENCY: functions are SECURITY INVOKER and are intended to be called
--   only by the server-only service_role client (BYPASSRLS) after
--   session/ownership/entitlement/input verification. EXECUTE is restricted to
--   service_role below. Callers wrap multi-statement work in a transaction.
--
-- LOCK ORDER (true as written): reservation row -> quota buckets -> budget
--   bucket. Reserve takes the bucket locks first because it creates the
--   reservation it will own and never locks an existing one; settle, mark,
--   finalize and delete all take the reservation row first, so the only
--   cross-function cycles are avoided. Any new function must follow the
--   reservation-first order.
--
-- CALL ORDER FOR DELETION: m4_delete_subject must run BEFORE the auth.users row
--   is deleted. Deleting the user first cascades the checks while the
--   text-keyed quota buckets survive, so nothing is settled and the counters
--   are orphaned. subject_key must be the user uuid rendered as text.
--
-- REVISION 3 — 22 November 2026: incorporates Lahiru's independent review of
--   revision 2 (PR #52). Changes:
--     * limit_count and both period_end values refresh under the bucket locks
--       before the admission test, so a refused request still records the
--       allowance actually applied;
--     * the budget limit_amount and period_end now refresh under the lock too;
--     * account deletion locks reservations first (it previously took buckets
--       first, which could deadlock against a concurrent settlement);
--     * a request_key replay for a different subject returns NULL;
--     * malformed budget input returns NULL instead of raising;
--     * m4_delete_subject takes p_now.
--
-- DRAFT NOTES: parameter shapes are M4 proposals for steward confirmation.
--   Content semantics (exact excerpts, offsets, highlight rules) stay app-side
--   (persistence-port.ts); 0001 CHECKs enforce vocabularies, shapes and caps.
--   The nine-field event revision is a separate migration (subject_ref agreed).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Atomic save: check + findings + optional history row, one transaction.
-- p_check / p_findings / p_history are jsonb shaped by persistence-mapping.ts.
-- History metadata is copied from the parent check, never trusted from the
-- caller. Returns the check id; raises on constraint violation (caller maps
-- the exception to a null result).
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
  v_check    public.scam_checks%ROWTYPE;
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

  SELECT * INTO v_check FROM public.scam_checks WHERE id = v_check_id;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_findings, '[]'::jsonb)) LOOP
    INSERT INTO public.scam_findings (
      id, check_id, user_id, rule_id, excerpt, start_offset, end_offset, context_note
    ) VALUES (
      COALESCE(NULLIF(f->>'id', '')::uuid, gen_random_uuid()),
      v_check_id, v_user_id, f->>'rule_id', f->>'excerpt',
      (f->>'start_offset')::integer, (f->>'end_offset')::integer, f->>'context_note'
    );
  END LOOP;

  IF p_history IS NOT NULL THEN
    IF v_check.verdict_label IS NULL THEN
      RAISE EXCEPTION 'history requires a validated verdict on check %', v_check_id;
    END IF;
    INSERT INTO public.checker_history (
      id, check_id, user_id, plan_id, created_at, expires_at, snippet, verdict_label, category_id
    ) VALUES (
      COALESCE(NULLIF(p_history->>'id', '')::uuid, gen_random_uuid()),
      v_check_id, v_user_id, v_check.plan_id, v_check.created_at, v_check.expires_at,
      p_history->>'snippet', v_check.verdict_label, v_check.category_id
    );
  END IF;

  RETURN v_check_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Idempotent, limit-enforcing reservation. Reserves one unit on the daily and
-- allowance buckets plus optional budget capacity, and REFUSES admission when
-- a limit is unconfigured (NULL) or would be exceeded. A duplicate request_key
-- returns the existing reservation. Returns NULL on refusal/invalid input.
--
-- p_daily_limit / p_allowance_limit are the trusted plan allowances supplied by
-- the server; they refresh the bucket's limit_count under the lock.
-- p_budget (nullable) = {budget_key, period_start, period_end, currency,
--                        limit_amount, reserved_amount}.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_reserve_check(
  p_subject         text,
  p_request_key     text,
  p_now             timestamptz,
  p_lease_ms        bigint,
  p_daily_start     timestamptz,
  p_daily_end       timestamptz,
  p_daily_limit     bigint,
  p_allowance_kind  text,
  p_allowance_start timestamptz,
  p_allowance_end   timestamptz,
  p_allowance_limit bigint,
  p_budget          jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing  public.checker_usage_reservations%ROWTYPE;
  v_daily     public.checker_quota_buckets%ROWTYPE;
  v_allow     public.checker_quota_buckets%ROWTYPE;
  v_budget    public.checker_budget_buckets%ROWTYPE;
  v_budget_id uuid := NULL;
  v_reserved  numeric(20,8) := 0;
  v_budget_key      text;
  v_budget_start    timestamptz;
  v_budget_end      timestamptz;
  v_budget_currency text;
  v_budget_limit    numeric(20,8);
  v_res       public.checker_usage_reservations%ROWTYPE;
BEGIN
  -- Validate before any mutation.
  IF p_subject IS NULL OR length(btrim(p_subject)) = 0 OR length(p_subject) > 128
     OR p_request_key IS NULL OR length(btrim(p_request_key)) = 0 OR length(p_request_key) > 128
     OR p_now IS NULL OR p_lease_ms IS NULL OR p_lease_ms <= 0
     OR p_daily_start IS NULL OR p_daily_end IS NULL OR p_daily_end <= p_daily_start
     OR p_allowance_start IS NULL OR p_allowance_end IS NULL OR p_allowance_end <= p_allowance_start
     OR p_allowance_kind IS NULL OR p_allowance_kind NOT IN ('monthly','trial') THEN
    RETURN NULL;
  END IF;

  -- NULL limit = unconfigured: refuse admission, never treat it as unlimited.
  IF p_daily_limit IS NULL OR p_allowance_limit IS NULL
     OR p_daily_limit < 0 OR p_allowance_limit < 0 THEN
    RETURN NULL;
  END IF;

  -- Parse and validate the optional budget object up front, so malformed input is
  -- a refusal (NULL) like every other parameter family rather than an exception.
  IF p_budget IS NOT NULL THEN
    BEGIN
      v_budget_key      := p_budget->>'budget_key';
      v_budget_start    := (p_budget->>'period_start')::timestamptz;
      v_budget_end      := (p_budget->>'period_end')::timestamptz;
      v_budget_currency := p_budget->>'currency';
      v_budget_limit    := (p_budget->>'limit_amount')::numeric;
      v_reserved        := COALESCE((p_budget->>'reserved_amount')::numeric, 0);
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    IF v_budget_key IS NULL OR length(btrim(v_budget_key)) = 0 OR length(v_budget_key) > 64
       OR v_budget_start IS NULL OR v_budget_end IS NULL OR v_budget_end <= v_budget_start
       OR v_budget_currency IS NULL OR length(btrim(v_budget_currency)) = 0 OR length(v_budget_currency) > 8
       OR v_budget_limit IS NULL OR v_budget_limit < 0 OR v_reserved < 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  -- FOR UPDATE cannot lock a row that does not exist yet, so duplicate request
  -- keys are serialised with a transaction-scoped advisory lock.
  PERFORM pg_advisory_xact_lock(hashtext(p_request_key));

  SELECT * INTO v_existing FROM public.checker_usage_reservations
    WHERE request_key = p_request_key;
  IF FOUND THEN
    -- A replay must belong to the same subject; otherwise it would return another
    -- subject's reservation row for a guessed request key.
    IF v_existing.subject_key IS DISTINCT FROM p_subject THEN
      RETURN NULL;
    END IF;
    RETURN to_jsonb(v_existing);
  END IF;

  -- Lock order: daily bucket -> allowance bucket -> budget bucket.
  INSERT INTO public.checker_quota_buckets
    (subject_key, period_kind, period_start, period_end, limit_count, completed_count, reserved_count, updated_at)
  VALUES (p_subject, 'daily', p_daily_start, p_daily_end, p_daily_limit, 0, 0, p_now)
  ON CONFLICT (subject_key, period_kind, period_start) DO NOTHING;
  SELECT * INTO v_daily FROM public.checker_quota_buckets
    WHERE subject_key = p_subject AND period_kind = 'daily' AND period_start = p_daily_start
    FOR UPDATE;

  INSERT INTO public.checker_quota_buckets
    (subject_key, period_kind, period_start, period_end, limit_count, completed_count, reserved_count, updated_at)
  VALUES (p_subject, p_allowance_kind, p_allowance_start, p_allowance_end, p_allowance_limit, 0, 0, p_now)
  ON CONFLICT (subject_key, period_kind, period_start) DO NOTHING;
  SELECT * INTO v_allow FROM public.checker_quota_buckets
    WHERE subject_key = p_subject AND period_kind = p_allowance_kind AND period_start = p_allowance_start
    FOR UPDATE;

  IF v_daily.id = v_allow.id THEN
    RAISE EXCEPTION 'daily and allowance buckets must be distinct';
  END IF;

  -- The stored allowance and window must reflect the trusted values actually
  -- applied, including when admission is refused below; otherwise a downgrade
  -- leaves the bucket advertising a limit the function no longer honours.
  UPDATE public.checker_quota_buckets
    SET limit_count = p_daily_limit, period_end = p_daily_end, updated_at = p_now
    WHERE id = v_daily.id;
  UPDATE public.checker_quota_buckets
    SET limit_count = p_allowance_limit, period_end = p_allowance_end, updated_at = p_now
    WHERE id = v_allow.id;

  -- Admission under the bucket locks.
  IF v_daily.completed_count + v_daily.reserved_count + 1 > p_daily_limit
     OR v_allow.completed_count + v_allow.reserved_count + 1 > p_allowance_limit THEN
    RETURN NULL;
  END IF;

  IF p_budget IS NOT NULL THEN
    INSERT INTO public.checker_budget_buckets
      (budget_key, period_start, period_end, currency, limit_amount, reserved_amount, spent_amount, updated_at)
    VALUES (
      v_budget_key, v_budget_start, v_budget_end,
      v_budget_currency, v_budget_limit, 0, 0, p_now
    )
    ON CONFLICT (budget_key, period_start) DO NOTHING;
    SELECT * INTO v_budget FROM public.checker_budget_buckets
      WHERE budget_key = v_budget_key AND period_start = v_budget_start
      FOR UPDATE;
    -- Refresh the trusted limit and window under the lock, like the quota buckets.
    UPDATE public.checker_budget_buckets
      SET limit_amount = v_budget_limit, period_end = v_budget_end, updated_at = p_now
      WHERE id = v_budget.id;
    IF v_budget.reserved_amount + v_reserved > v_budget_limit THEN
      RETURN NULL;
    END IF;
    v_budget_id := v_budget.id;
  END IF;

  -- Every check passed: mutate.
  UPDATE public.checker_quota_buckets
    SET reserved_count = reserved_count + 1, updated_at = p_now
    WHERE id = v_daily.id;
  UPDATE public.checker_quota_buckets
    SET reserved_count = reserved_count + 1, updated_at = p_now
    WHERE id = v_allow.id;
  IF v_budget_id IS NOT NULL THEN
    UPDATE public.checker_budget_buckets
      SET reserved_amount = reserved_amount + v_reserved, updated_at = p_now
      WHERE id = v_budget_id;
  END IF;

  INSERT INTO public.checker_usage_reservations (
    request_key, subject_key, daily_bucket_id, allowance_bucket_id, budget_bucket_id,
    state, reserved_amount, actual_amount, created_at, lease_expires_at, settled_at
  ) VALUES (
    p_request_key, p_subject, v_daily.id, v_allow.id, v_budget_id,
    'reserved', v_reserved, NULL, p_now, p_now + (p_lease_ms || ' milliseconds')::interval, NULL
  ) RETURNING * INTO v_res;

  RETURN to_jsonb(v_res);
END;
$$;

-- ----------------------------------------------------------------------------
-- Exactly-once settlement. completed -> consumes quota + settles spend;
-- limited/unavailable -> release quota (a reported provider charge may still
-- settle). An unreported charge on a non-completed result is REFUSED before any
-- counter changes — the caller must use reconciliation. Returns false for an
-- invalid/already-settled reservation; true on success.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_settle_reservation(
  p_reservation_id uuid,
  p_status         text,
  p_actual_spend   numeric DEFAULT NULL,
  p_now            timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_res    public.checker_usage_reservations%ROWTYPE;
  v_daily  public.checker_quota_buckets%ROWTYPE;
  v_allow  public.checker_quota_buckets%ROWTYPE;
  v_budget public.checker_budget_buckets%ROWTYPE;
  v_spend  numeric;
BEGIN
  -- Validate first: NULL NOT IN (...) is NULL and would slip through a bare
  -- NOT IN guard, silently releasing the reservation.
  IF p_reservation_id IS NULL OR p_now IS NULL
     OR p_status IS NULL OR p_status NOT IN ('completed','limited','unavailable') THEN
    RETURN false;
  END IF;
  IF p_actual_spend IS NOT NULL AND p_actual_spend < 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_res FROM public.checker_usage_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.state <> 'reserved' THEN
    RETURN false; -- exactly once; state re-read after locking
  END IF;

  SELECT * INTO v_daily FROM public.checker_quota_buckets WHERE id = v_res.daily_bucket_id FOR UPDATE;
  SELECT * INTO v_allow FROM public.checker_quota_buckets WHERE id = v_res.allowance_bucket_id FOR UPDATE;
  IF v_res.budget_bucket_id IS NOT NULL THEN
    SELECT * INTO v_budget FROM public.checker_budget_buckets WHERE id = v_res.budget_bucket_id FOR UPDATE;
  END IF;

  -- Validate the spend rule BEFORE any mutation: RETURN does not roll back.
  IF v_res.budget_bucket_id IS NOT NULL AND p_status <> 'completed' AND p_actual_spend IS NULL THEN
    RETURN false; -- uncertain spend: reconcile, do not guess
  END IF;
  IF v_daily.reserved_count < 1 OR v_allow.reserved_count < 1 THEN
    RAISE EXCEPTION 'reservation % has no reserved quota unit to settle', p_reservation_id;
  END IF;

  v_spend := COALESCE(p_actual_spend, v_res.reserved_amount);

  UPDATE public.checker_quota_buckets
    SET reserved_count = reserved_count - 1,
        completed_count = completed_count + CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
        updated_at = p_now
    WHERE id IN (v_res.daily_bucket_id, v_res.allowance_bucket_id);

  IF v_res.budget_bucket_id IS NOT NULL THEN
    UPDATE public.checker_budget_buckets
      SET reserved_amount = GREATEST(0, reserved_amount - v_res.reserved_amount),
          spent_amount = spent_amount + v_spend,
          updated_at = p_now
      WHERE id = v_res.budget_bucket_id;
  END IF;

  UPDATE public.checker_usage_reservations
    SET state = CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'released' END,
        outcome_status = p_status,
        actual_amount = CASE WHEN v_res.budget_bucket_id IS NOT NULL THEN v_spend ELSE NULL END,
        settled_at = p_now
    WHERE id = p_reservation_id;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Reconciliation marker. The analysed outcome is known, so quota is settled
-- now (released, or consumed when completed); only the provider spend stays
-- open. outcome_status records the outcome so finalisation never re-decides it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_mark_reconciliation(
  p_reservation_id uuid,
  p_status         text,
  p_now            timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_res   public.checker_usage_reservations%ROWTYPE;
  v_daily public.checker_quota_buckets%ROWTYPE;
  v_allow public.checker_quota_buckets%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_now IS NULL
     OR p_status IS NULL OR p_status NOT IN ('completed','limited','unavailable') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_res FROM public.checker_usage_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.state <> 'reserved' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_daily FROM public.checker_quota_buckets WHERE id = v_res.daily_bucket_id FOR UPDATE;
  SELECT * INTO v_allow FROM public.checker_quota_buckets WHERE id = v_res.allowance_bucket_id FOR UPDATE;
  IF v_daily.reserved_count < 1 OR v_allow.reserved_count < 1 THEN
    RAISE EXCEPTION 'reservation % has no reserved quota unit to reconcile', p_reservation_id;
  END IF;

  UPDATE public.checker_quota_buckets
    SET reserved_count = reserved_count - 1,
        completed_count = completed_count + CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
        updated_at = p_now
    WHERE id IN (v_res.daily_bucket_id, v_res.allowance_bucket_id);

  -- The spend reservation is deliberately NOT released here.
  UPDATE public.checker_usage_reservations
    SET state = 'reconciliation_required', outcome_status = p_status, settled_at = p_now
    WHERE id = p_reservation_id;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Finalise a reconciliation: close the provider spend at a known amount and
-- move the reservation to its recorded terminal state. Quota was already
-- settled at mark time, so nothing is double-counted.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_finalize_reconciliation(
  p_reservation_id uuid,
  p_actual_spend   numeric,
  p_now            timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_res    public.checker_usage_reservations%ROWTYPE;
  v_budget public.checker_budget_buckets%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_now IS NULL
     OR p_actual_spend IS NULL OR p_actual_spend < 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_res FROM public.checker_usage_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.state <> 'reconciliation_required' OR v_res.outcome_status IS NULL THEN
    RETURN false;
  END IF;

  IF v_res.budget_bucket_id IS NOT NULL THEN
    SELECT * INTO v_budget FROM public.checker_budget_buckets WHERE id = v_res.budget_bucket_id FOR UPDATE;
    UPDATE public.checker_budget_buckets
      SET reserved_amount = GREATEST(0, reserved_amount - v_res.reserved_amount),
          spent_amount = spent_amount + p_actual_spend,
          updated_at = p_now
      WHERE id = v_res.budget_bucket_id;
  END IF;

  UPDATE public.checker_usage_reservations
    SET state = CASE WHEN v_res.outcome_status = 'completed' THEN 'completed' ELSE 'released' END,
        actual_amount = CASE WHEN v_res.budget_bucket_id IS NOT NULL THEN p_actual_spend ELSE NULL END,
        settled_at = p_now
    WHERE id = p_reservation_id;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Account deletion — direction (c), steward answer 21 Nov (pending Suraji's
-- privacy confirmation). Outstanding reservations and provider charges are
-- resolved first (an unresolved charge is settled conservatively at its
-- reserved amount so spend is never under-counted), then the subject's
-- user-linked quota buckets and reservations are removed. Non-user-linked
-- aggregate spend totals (checker_budget_buckets) are retained. Checks cascade
-- their findings/history/feedback. Deleting history alone never resets quota.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_delete_subject(
  p_user uuid,
  p_now  timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_checks       integer;
  v_history      integer;
  v_feedback     integer;
  v_buckets      integer;
  v_reservations integer;
  v_subject      text;
  r              public.checker_usage_reservations%ROWTYPE;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('checks',0,'history',0,'feedback',0,'quota_buckets',0,'reservations',0);
  END IF;
  v_subject := p_user::text;

  SELECT count(*) INTO v_history  FROM public.checker_history  WHERE user_id = p_user;
  SELECT count(*) INTO v_feedback FROM public.checker_feedback WHERE user_id = p_user;

  -- Lock order matches settlement: reservation rows first, then the quota buckets,
  -- then the budget buckets. Locking buckets first here would let this function
  -- wait on a reservation that a concurrent settle already holds while that settle
  -- waits for the bucket -- a genuine deadlock.
  PERFORM 1 FROM public.checker_usage_reservations
    WHERE subject_key = v_subject ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.checker_quota_buckets
    WHERE subject_key = v_subject ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.checker_budget_buckets b
    WHERE b.id IN (
      SELECT budget_bucket_id FROM public.checker_usage_reservations
      WHERE subject_key = v_subject AND budget_bucket_id IS NOT NULL
    )
    ORDER BY b.id FOR UPDATE;

  FOR r IN SELECT * FROM public.checker_usage_reservations
           WHERE subject_key = v_subject ORDER BY id LOOP
    IF r.state = 'reserved' THEN
      UPDATE public.checker_quota_buckets
        SET reserved_count = GREATEST(0, reserved_count - 1), updated_at = p_now
        WHERE id IN (r.daily_bucket_id, r.allowance_bucket_id);
      IF r.budget_bucket_id IS NOT NULL THEN
        UPDATE public.checker_budget_buckets
          SET reserved_amount = GREATEST(0, reserved_amount - r.reserved_amount),
              spent_amount = spent_amount + r.reserved_amount, updated_at = p_now
          WHERE id = r.budget_bucket_id;
      END IF;
    ELSIF r.state = 'reconciliation_required' AND r.budget_bucket_id IS NOT NULL THEN
      UPDATE public.checker_budget_buckets
        SET reserved_amount = GREATEST(0, reserved_amount - r.reserved_amount),
            spent_amount = spent_amount + r.reserved_amount, updated_at = p_now
        WHERE id = r.budget_bucket_id;
    END IF;
  END LOOP;

  DELETE FROM public.checker_usage_reservations WHERE subject_key = v_subject;
  GET DIAGNOSTICS v_reservations = ROW_COUNT;
  DELETE FROM public.checker_quota_buckets WHERE subject_key = v_subject;
  GET DIAGNOSTICS v_buckets = ROW_COUNT;

  DELETE FROM public.scam_checks WHERE user_id = p_user;
  GET DIAGNOSTICS v_checks = ROW_COUNT;

  RETURN jsonb_build_object('checks', v_checks, 'history', v_history, 'feedback', v_feedback,
                            'quota_buckets', v_buckets, 'reservations', v_reservations);
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

-- ----------------------------------------------------------------------------
-- Execution privileges: server-only. SECURITY INVOKER is retained; the
-- service_role client bypasses RLS by design and is the only intended caller.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.m4_save_check(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_reserve_check(text, text, timestamptz, bigint, timestamptz, timestamptz, bigint, text, timestamptz, timestamptz, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_settle_reservation(uuid, text, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_mark_reconciliation(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_finalize_reconciliation(uuid, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_delete_subject(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_purge_expired(timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.m4_save_check(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_reserve_check(text, text, timestamptz, bigint, timestamptz, timestamptz, bigint, text, timestamptz, timestamptz, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_settle_reservation(uuid, text, numeric, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_mark_reconciliation(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_finalize_reconciliation(uuid, numeric, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_delete_subject(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_purge_expired(timestamptz) TO service_role;

COMMIT;

-- ============================================================================
-- NOT here (gated): the live async Supabase adapter that calls these functions;
--   the nine-field event revision (subject_ref); event purge/retention
--   scheduling; applying any function (steward + access). Nothing is executed.
-- ============================================================================
