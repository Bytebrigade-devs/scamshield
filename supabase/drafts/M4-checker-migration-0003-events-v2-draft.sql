-- ============================================================================
-- M4 AI Scam Checker — migration 0003: nine-field 0.2.0-draft events (revision 1, APPLIED)
-- ============================================================================
-- STATUS: APPLIED — 24 November 2026, once (302 ms, no raise), to the main project
--   https://gcqfwynvtjjokndpturf.supabase.co. Schema confirmed by direct query
--   (subject_ref text nullable; version CHECK accepts both drafts; both constraints
--   and the partial index present; m4_valid_subject_ref / m4_purge_events present).
--   Verify rev 6 then ran with blocks 14–15 live (361 ms) and passed; all tables */0.
--   DO NOT RE-RUN this file on that project. Builds on the applied 0001 (rev 6) and
--   0002 (rev 5); it adds no table and changes no existing column type.
--
-- PURPOSE (closes the three gaps 0001 could not): 
--   1. `checker_usage_events.subject_ref` — the agreed opaque per-user reference
--      (Vishmi + Lahiru 19 Nov, steward 20 Nov), so an event can be attributed and
--      removed with the account;
--   2. 0001 accepted ONLY `0.1.0-draft`. This lifts that to accept `0.2.0-draft`
--      with a mandatory, hygiene-checked `subject_ref`, while keeping legacy
--      `0.1.0-draft` rows valid (they carry no reference);
--   3. `m4_delete_subject` now also deletes the subject's events — until now
--      direction-(c) deletion could not remove them (rev-4 record §2), which was
--      the one user-linked row deletion left behind;
--   4. `m4_purge_events(p_before)` — the helper a scheduler calls for the proposed
--      30-day event window (D4; the TTL itself is still provisional).
--
-- DEPENDS ON: 0001 revision 6 (applied), 0002 revision 5 (applied). Apply AFTER
--   them, by exact filename, as a single whole file.
--
-- ONE-SHOT: this file opens with BEGIN and closes with COMMIT and uses a plain
--   `ADD COLUMN` (no IF NOT EXISTS), so a run that FAILS rolls back and may be
--   retried, but a run that SUCCEEDS must never be repeated.
--
-- HONESTY BOUNDARY: applied and verified on the main project (see STATUS). The
--   runtime v2 refusal has been flipped — the durable adapter now accepts
--   0.2.0-draft events and reads/writes subject_ref. The 30-day event TTL remains
--   PROVISIONAL (M5 read-window + M1 privacy ratification still owed); scheduling
--   m4_purge_events is gated on that decision and on enabling pg_cron (see 0004).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. subject_ref hygiene, mirroring the runtime normaliser in
--    code/boundary/x13-event.ts (normaliseSubjectRef): a non-empty opaque
--    string, no whitespace or control characters, no '@', not a bare phone
--    number, not a JWT, not a URL. STRICT, so callers must use `IS TRUE`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_valid_subject_ref(v text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT length(btrim(v)) > 0
     AND public.m4_utf16_units(v) <= 128
     AND v !~ '\s'                       -- no whitespace
     AND v !~ '[[:cntrl:]]'              -- no control characters
     AND position('@' in v) = 0          -- never an email-shaped value
     AND v !~ '^\+?[0-9]{7,}$'           -- never a bare phone number
     AND v !~ '^eyJ[[:alnum:]_-]*\.'     -- never a JWT
     AND v !~* '^[a-z][a-z0-9+.-]*://'   -- never a URL
$$;

-- ----------------------------------------------------------------------------
-- 2. The column, the accepted versions, and the presence rule.
--    Legacy rows (0.1.0-draft) have no reference and stay NULL and valid;
--    a 0.2.0-draft row MUST carry a hygiene-valid reference.
-- ----------------------------------------------------------------------------
ALTER TABLE public.checker_usage_events ADD COLUMN subject_ref text;

ALTER TABLE public.checker_usage_events DROP CONSTRAINT checker_usage_events_version;
ALTER TABLE public.checker_usage_events ADD CONSTRAINT checker_usage_events_version CHECK (
  contract_version IN ('0.1.0-draft', '0.2.0-draft')
);

-- `IS TRUE` rather than a bare call: the helper is STRICT, so a NULL reference
-- would otherwise evaluate to NULL and a CHECK passes on NULL.
ALTER TABLE public.checker_usage_events ADD CONSTRAINT checker_usage_events_subject_ref CHECK (
  (contract_version = '0.1.0-draft' AND subject_ref IS NULL)
  OR (contract_version = '0.2.0-draft' AND public.m4_valid_subject_ref(subject_ref) IS TRUE)
);

-- Deletion and per-subject reads filter on this; NULLs (legacy rows) are excluded.
CREATE INDEX checker_usage_events_subject_idx
  ON public.checker_usage_events (subject_ref)
  WHERE subject_ref IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Account deletion now removes the subject's events too.
--    The lock order and settlement logic are IDENTICAL to 0002 revision 5; the
--    only additions are the event deletion and its count. Events carry no FK to
--    checks, so their places in the order do not matter.
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
  v_events       integer;
  v_subject      text;
  r              public.checker_usage_reservations%ROWTYPE;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('checks',0,'history',0,'feedback',0,'quota_buckets',0,
                              'reservations',0,'events',0);
  END IF;
  v_subject := p_user::text;

  -- Subject lock first: serialises deletion against reserve/settle/mark/finalize.
  PERFORM pg_advisory_xact_lock(hashtext('m4-subject'), hashtext(v_subject));

  SELECT count(*) INTO v_history  FROM public.checker_history  WHERE user_id = p_user;
  SELECT count(*) INTO v_feedback FROM public.checker_feedback WHERE user_id = p_user;

  -- Lock order matches settlement: reservations → quota buckets → budget buckets.
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

  -- Direction (c), now including events: only 0.2.0-draft rows carry a reference,
  -- so legacy 0.1.0-draft rows are unaffected (they name no subject).
  DELETE FROM public.checker_usage_events WHERE subject_ref = v_subject;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  RETURN jsonb_build_object('checks', v_checks, 'history', v_history, 'feedback', v_feedback,
                            'quota_buckets', v_buckets, 'reservations', v_reservations,
                            'events', v_events);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Event purge helper for the proposed 30-day window (D4). The TTL is still
--    PROVISIONAL — M5's read-window and M1's privacy sign-off must ratify it —
--    so this function is added but must not be scheduled until that decision is
--    recorded. It deletes nothing unless a caller passes a cutoff.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m4_purge_events(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_removed integer;
BEGIN
  IF p_before IS NULL THEN
    RETURN 0;
  END IF;
  DELETE FROM public.checker_usage_events WHERE occurred_at < p_before;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Privileges: server-only, as with every other M4 function. CREATE OR
--    REPLACE preserves m4_delete_subject's existing grants; the new helper needs
--    its own.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.m4_valid_subject_ref(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.m4_purge_events(timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.m4_valid_subject_ref(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_purge_events(timestamptz) TO service_role;

COMMIT;

-- ============================================================================
-- NOT here (still gated):
--   * scheduling m4_purge_events (the 30-day event TTL is provisional — needs M5
--     read-window + M1 privacy ratification, and pg_cron enabled). The checks
--     purge m4_purge_expired is scheduled separately in migration 0004 (D4 split);
--   * wiring M5's per-user dashboard read.
-- DONE since the apply: the runtime v2 refusal was flipped — durable-adapter.ts
--   now accepts 0.2.0-draft and reads/writes subject_ref (24 November 2026).
-- ============================================================================
