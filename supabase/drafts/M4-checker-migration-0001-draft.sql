-- ============================================================================
-- M4 AI Scam Checker — durable persistence migration 0001 (DRAFT, revision 4)
-- ============================================================================
-- STATUS: DRAFT for schema-steward review. NOT applied. No table, policy,
--   function or trigger here exists in any database.
--
-- REVISION 2 — 21 November 2026: incorporates the steward's review at commit
--   74d0958 ("Changes are needed before approval"). Changes made:
--     * restored bounded length limits on every text column that was left
--       unbounded (ids, rule_id, taxonomy_version, context_note, event fields);
--     * counters are now bigint, not integer;
--     * checker_history gains UNIQUE(check_id) and a trigger that refuses a row
--       whose metadata differs from its parent check;
--     * findings, history and feedback reads now also require the parent check
--       to be unexpired;
--     * ids: opaque text for scam_checks only; uuid for findings, history,
--       feedback, quota/budget buckets and reservations (the previous draft
--       stored every id as text, which did not implement the agreed mix);
--     * JSON columns now validate element shape, not only array length;
--     * the fixed event type is enforced in the database.
--
-- REVISION 3 — 21 November 2026: incorporates the steward's answers to the
--   follow-up (same day). Changes made:
--     * budget_key bounded to 64 characters (her confirmed limit; was 128);
--     * limit_count semantics fixed: NULL = UNCONFIGURED and reserve MUST
--       refuse admission (not unlimited usage);
--     * reservations require distinct daily/allowance buckets;
--     * reservations gain outcome_status so reconciliation can finalise spend
--       without re-deciding the quota outcome (M4 proposal, name pending);
--     * checker_usage_events accepts only 0.1.0-draft until the nine-field
--       migration adds subject_ref (a 0.2.0-draft row cannot be stored here);
--     * helper/trigger EXECUTE is granted to service_role: CHECK constraints
--       and triggers evaluate as the inserting role, so revoking from PUBLIC
--       without granting would break the writes this design exists for.
--   Length limits are recorded as the steward's 21 NOV DECISIONS, not as
--   verbatim requirements from her 19 November reply.
--
-- REVISION 4 — 22 November 2026: incorporates Lahiru's independent review of
--   revision 3 (PR #52). Changes made:
--     * explicit table privileges for service_role, so the SECURITY INVOKER
--       functions do not depend on Supabase's implicit default grants;
--     * indexes on the reservation bucket FKs, which the FK checks and the
--       account-deletion path scan;
--     * a column comment recording that outcome_status is the settled copy of
--       the analysis status (not a second vocabulary).
--
-- DECISIONS RECORDED 21 NOV (steward answers; see the review/answer records):
--   * account deletion follows direction (c): the subject's user-linked quota
--     buckets and reservations are removed after outstanding reservations and
--     provider charges are resolved; only non-user-linked aggregate spend
--     totals (checker_budget_buckets) are retained. A deleted account may
--     re-register with a fresh allowance. PENDING Suraji's privacy confirmation
--     and team awareness — this reverses the earlier "counters never reset"
--     rule. Deleting history alone still never resets quota.
--   * limit_count is confirmed (bigint, >= 0); NULL = unconfigured = refuse.
--   * outcome_status is an M4-proposed column name, pending her confirmation.
--
-- SOURCES:
--   * Steward design reply 19 Nov 2026 and review 21 Nov 2026.
--   * Team approval 19 Nov 2026 (design + steward + retention direction).
--   * M2-J access rule 18 Nov 2026 (own-row reads incl. read-only after
--     expiry; no browser writes; service-role-only writes; account deletion
--     cascades user content).
--   * App contract: code/boundary/persistence-port.ts (only `completed`
--     consumes quota; `limited`/`unavailable` release it).
--
-- `subject_ref`: the nine-field event revision is deliberately NOT in this
--   migration. The name IS agreed (Vishmi/M5 + Lahiru/M2 19 Nov; the steward
--   20 Nov); only the migration is separate, and it must land before per-user
--   dashboard integration. Earlier "name unagreed" notes are corrected here.
--
-- RE-RUNNABILITY: this migration is a ONE-TIME apply on a fresh project. It uses
--   plain CREATE TRIGGER / CREATE POLICY (no IF NOT EXISTS), so re-running it
--   after a partial manual run will fail at the first already-created object.
--   That is intentional for a single steward apply; do not treat it as idempotent.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helpers (IMMUTABLE so they can back CHECK constraints).
-- ----------------------------------------------------------------------------

-- PostgreSQL length() counts code points; the app counts UTF-16 units (a
-- supplementary-plane emoji weighs 2). units = chars + supplementary chars.
CREATE OR REPLACE FUNCTION public.m4_utf16_units(s text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT length(s) + (
    SELECT count(*)::integer
    FROM regexp_split_to_table(s, '') AS ch
    WHERE ascii(ch) > 65535
  );
$$;

-- reason_highlights must be an array of at most four {start,end,excerpt}
-- objects with exactly those keys, integer non-negative offsets, end > start,
-- and a non-empty excerpt within the reason cap.
CREATE OR REPLACE FUNCTION public.m4_valid_highlights(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(v) = 'array'
     AND jsonb_array_length(v) <= 4
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v) AS e
       WHERE jsonb_typeof(e) <> 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(e)) <> 3
          OR NOT (e ? 'start' AND e ? 'end' AND e ? 'excerpt')
          OR jsonb_typeof(e->'start') <> 'number'
          OR jsonb_typeof(e->'end') <> 'number'
          OR jsonb_typeof(e->'excerpt') <> 'string'
          OR (e->>'start') !~ '^[0-9]+$'
          OR (e->>'end') !~ '^[0-9]+$'
          OR (e->>'end')::bigint <= (e->>'start')::bigint
          OR length(e->>'excerpt') = 0
          OR public.m4_utf16_units(e->>'excerpt') > 1000
     );
$$;

-- limitations must be an array of at most ten non-empty bounded strings.
CREATE OR REPLACE FUNCTION public.m4_valid_limitations(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(v) = 'array'
     AND jsonb_array_length(v) <= 10
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v) AS e
       WHERE jsonb_typeof(e) <> 'string'
          OR length(e #>> '{}') = 0
          OR public.m4_utf16_units(e #>> '{}') > 1000
     );
$$;

-- Bounded opaque id: non-empty after trim, at most 128 characters, no
-- whitespace (matches the app's own id rule).
CREATE OR REPLACE FUNCTION public.m4_valid_opaque_id(v text, max_len integer DEFAULT 128)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v IS NOT NULL
     AND length(btrim(v)) > 0
     AND length(v) <= max_len
     AND v !~ '\s';
$$;

-- ----------------------------------------------------------------------------
-- 1. scam_checks — one row per accepted check (row identity).
--    Submitted text and candidates are NOT persisted; the reply is flattened;
--    rejected results are not stored.
-- ----------------------------------------------------------------------------
CREATE TABLE public.scam_checks (
  id                text        PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id           text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  analysis_status   text        NOT NULL,
  analysis_mode     text        NOT NULL,
  category_id       text        NOT NULL,
  taxonomy_version  text        NOT NULL,
  verdict_label     text,
  risk_level        text,
  reason            text,
  reason_highlights jsonb       NOT NULL DEFAULT '[]'::jsonb,
  limitations       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT scam_checks_id CHECK (public.m4_valid_opaque_id(id, 128)),
  CONSTRAINT scam_checks_plan CHECK (
    plan_id IN ('sentinel','guardian','aegis','trial') AND length(plan_id) <= 32
  ),
  CONSTRAINT scam_checks_taxonomy CHECK (
    length(btrim(taxonomy_version)) > 0 AND length(taxonomy_version) <= 32
  ),
  CONSTRAINT scam_checks_status_mode_pair CHECK (
    (analysis_status = 'completed'   AND analysis_mode = 'rules_and_ai') OR
    (analysis_status = 'limited'     AND analysis_mode = 'rules_only')   OR
    (analysis_status = 'unavailable' AND analysis_mode = 'none')
  ),
  CONSTRAINT scam_checks_category CHECK (
    category_id IN ('phishing','romance_scam','fake_invoice','prize_lottery_scam','unknown_other')
  ),
  CONSTRAINT scam_checks_verdict CHECK (
    verdict_label IS NULL OR verdict_label IN
      ('suspicious','potentially suspicious','no obvious indicators','high risk','undetermined')
  ),
  CONSTRAINT scam_checks_risk CHECK (
    risk_level IS NULL OR risk_level IN ('low','suspicious','high','undetermined')
  ),
  CONSTRAINT scam_checks_reason_len CHECK (reason IS NULL OR public.m4_utf16_units(reason) <= 1000),
  CONSTRAINT scam_checks_highlights CHECK (public.m4_valid_highlights(reason_highlights)),
  CONSTRAINT scam_checks_limitations CHECK (public.m4_valid_limitations(limitations)),
  CONSTRAINT scam_checks_expiry_after_created CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX scam_checks_id_user_idx ON public.scam_checks (id, user_id);
CREATE INDEX scam_checks_user_created_idx ON public.scam_checks (user_id, created_at DESC);
CREATE INDEX scam_checks_expires_idx ON public.scam_checks (expires_at);

-- ----------------------------------------------------------------------------
-- 2. scam_findings — rule evidence (offsets against the analysed input).
--    uuid identity (steward review, item 2).
-- ----------------------------------------------------------------------------
CREATE TABLE public.scam_findings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id     text        NOT NULL,
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  rule_id      text        NOT NULL,
  excerpt      text        NOT NULL,
  start_offset integer     NOT NULL,
  end_offset   integer     NOT NULL,
  context_note text,
  CONSTRAINT scam_findings_ownership_fk FOREIGN KEY (check_id, user_id)
    REFERENCES public.scam_checks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT scam_findings_rule_id CHECK (length(btrim(rule_id)) > 0 AND length(rule_id) <= 64),
  CONSTRAINT scam_findings_offsets CHECK (start_offset >= 0 AND end_offset > start_offset),
  CONSTRAINT scam_findings_excerpt_len CHECK (
    length(excerpt) > 0 AND public.m4_utf16_units(excerpt) <= 2000
  ),
  CONSTRAINT scam_findings_context_len CHECK (
    context_note IS NULL OR public.m4_utf16_units(context_note) <= 1000
  )
);
CREATE INDEX scam_findings_check_idx ON public.scam_findings (check_id);

-- ----------------------------------------------------------------------------
-- 3. checker_history — user-visible history row (same transaction as the check).
--    One row per check; metadata is copied from the parent, and a trigger
--    refuses drift (steward review, items 1 and 4).
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id      text        NOT NULL,
  user_id       uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id       text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  snippet       text        NOT NULL,
  verdict_label text        NOT NULL,
  category_id   text        NOT NULL,
  CONSTRAINT checker_history_ownership_fk FOREIGN KEY (check_id, user_id)
    REFERENCES public.scam_checks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT checker_history_one_per_check UNIQUE (check_id),
  CONSTRAINT checker_history_snippet_len CHECK (
    public.m4_utf16_units(snippet) <= 280 AND length(btrim(snippet)) > 0
  ),
  CONSTRAINT checker_history_verdict CHECK (
    verdict_label IN ('suspicious','potentially suspicious','no obvious indicators','high risk','undetermined')
  ),
  CONSTRAINT checker_history_category CHECK (
    category_id IN ('phishing','romance_scam','fake_invoice','prize_lottery_scam','unknown_other')
  ),
  CONSTRAINT checker_history_expiry_after_created CHECK (expires_at > created_at)
);
CREATE INDEX checker_history_user_created_idx ON public.checker_history (user_id, created_at DESC);
CREATE INDEX checker_history_expires_idx ON public.checker_history (expires_at);

-- History metadata must equal its parent check: plan, timestamps, category and
-- verdict. Defence in depth for any direct service-role insert.
CREATE OR REPLACE FUNCTION public.m4_history_matches_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c public.scam_checks%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.scam_checks WHERE id = NEW.check_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'history row references a missing check %', NEW.check_id;
  END IF;
  IF c.user_id IS DISTINCT FROM NEW.user_id
     OR c.plan_id IS DISTINCT FROM NEW.plan_id
     OR c.created_at IS DISTINCT FROM NEW.created_at
     OR c.expires_at IS DISTINCT FROM NEW.expires_at
     OR c.category_id IS DISTINCT FROM NEW.category_id
     OR c.verdict_label IS DISTINCT FROM NEW.verdict_label THEN
    RAISE EXCEPTION 'history metadata does not match check %', NEW.check_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checker_history_matches_parent
  BEFORE INSERT OR UPDATE ON public.checker_history
  FOR EACH ROW EXECUTE FUNCTION public.m4_history_matches_parent();

-- ----------------------------------------------------------------------------
-- 4. checker_feedback — "Report a wrong result" (one row per owned check).
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  check_id    text        NOT NULL,
  category_id text        NOT NULL,
  reason_code text        NOT NULL,
  trigger     text        NOT NULL DEFAULT 'wrong_result',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checker_feedback_ownership_fk FOREIGN KEY (check_id, user_id)
    REFERENCES public.scam_checks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT checker_feedback_one_per_check UNIQUE (user_id, check_id),
  CONSTRAINT checker_feedback_trigger CHECK (trigger = 'wrong_result'),
  CONSTRAINT checker_feedback_reason CHECK (
    reason_code IN ('wrong_category','missed_scam','false_alarm','unclear_explanation','other')
  ),
  CONSTRAINT checker_feedback_category CHECK (
    category_id IN ('phishing','romance_scam','fake_invoice','prize_lottery_scam','unknown_other')
  )
);
CREATE INDEX checker_feedback_user_created_idx ON public.checker_feedback (user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. checker_usage_events — the current eight-field m4.check_outcome contract.
--    Service-role only. The nine-field revision (`subject_ref`) is a separate
--    migration (name agreed; migration not written).
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_usage_events (
  event_id         text        PRIMARY KEY,
  contract_version text        NOT NULL,
  event_type       text        NOT NULL,
  occurred_at      timestamptz NOT NULL,
  taxonomy_version text        NOT NULL,
  category_id      text        NOT NULL,
  analysis_status  text        NOT NULL,
  analysis_mode    text        NOT NULL,
  CONSTRAINT checker_usage_events_id CHECK (public.m4_valid_opaque_id(event_id, 128)),
  CONSTRAINT checker_usage_events_version CHECK (
    contract_version = '0.1.0-draft'
  ),
  CONSTRAINT checker_usage_events_type CHECK (event_type = 'm4.check_outcome'),
  CONSTRAINT checker_usage_events_taxonomy CHECK (
    length(btrim(taxonomy_version)) > 0 AND length(taxonomy_version) <= 32
  ),
  CONSTRAINT checker_usage_events_pair CHECK (
    (analysis_status = 'completed'   AND analysis_mode = 'rules_and_ai') OR
    (analysis_status = 'limited'     AND analysis_mode = 'rules_only')   OR
    (analysis_status = 'unavailable' AND analysis_mode = 'none')
  ),
  CONSTRAINT checker_usage_events_category CHECK (
    category_id IN ('phishing','romance_scam','fake_invoice','prize_lottery_scam','unknown_other')
  )
);
CREATE INDEX checker_usage_events_occurred_idx ON public.checker_usage_events (occurred_at);

-- ----------------------------------------------------------------------------
-- 6. checker_quota_buckets — durable daily/monthly/trial counters.
--    bigint counters (steward review, item 1). limit_count is the trusted plan
--    allowance supplied by the server; NULL means UNCONFIGURED and
--    `m4_reserve_check` MUST refuse admission (steward answer, item 3) — it is
--    never treated as unlimited usage.
--    History deletion never resets counters. Account deletion removes the
--    subject's buckets/reservations (steward answer, item 2, direction (c),
--    pending Suraji's privacy confirmation); non-user-linked budget totals stay.
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_quota_buckets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key     text        NOT NULL,
  period_kind     text        NOT NULL,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  limit_count     bigint,
  completed_count bigint      NOT NULL DEFAULT 0,
  reserved_count  bigint      NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checker_quota_buckets_subject CHECK (
    length(btrim(subject_key)) > 0 AND length(subject_key) <= 128
  ),
  CONSTRAINT checker_quota_buckets_period CHECK (period_kind IN ('daily','monthly','trial')),
  CONSTRAINT checker_quota_buckets_counts CHECK (
    completed_count >= 0 AND reserved_count >= 0
  ),
  CONSTRAINT checker_quota_buckets_limit CHECK (limit_count IS NULL OR limit_count >= 0),
  CONSTRAINT checker_quota_buckets_window CHECK (period_end > period_start),
  CONSTRAINT checker_quota_buckets_unique UNIQUE (subject_key, period_kind, period_start)
);

-- ----------------------------------------------------------------------------
-- 7. checker_budget_buckets — provider-spend counters.
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_budget_buckets (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_key      text          NOT NULL,
  period_start    timestamptz   NOT NULL,
  period_end      timestamptz   NOT NULL,
  currency        text          NOT NULL,
  limit_amount    numeric(20,8) NOT NULL DEFAULT 0,
  reserved_amount numeric(20,8) NOT NULL DEFAULT 0,
  spent_amount    numeric(20,8) NOT NULL DEFAULT 0,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT checker_budget_buckets_key CHECK (
    length(btrim(budget_key)) > 0 AND length(budget_key) <= 64
  ),
  CONSTRAINT checker_budget_buckets_currency CHECK (
    length(btrim(currency)) > 0 AND length(currency) <= 8
  ),
  CONSTRAINT checker_budget_buckets_amounts CHECK (
    limit_amount >= 0 AND reserved_amount >= 0 AND spent_amount >= 0
  ),
  CONSTRAINT checker_budget_buckets_window CHECK (period_end > period_start),
  CONSTRAINT checker_budget_buckets_unique UNIQUE (budget_key, period_start)
);

-- ----------------------------------------------------------------------------
-- 8. checker_usage_reservations — atomic admission unit.
--    States: reserved -> completed | released | reconciliation_required.
--    outcome_status records the analysed outcome once quota is settled, so
--    m4_finalize_reconciliation can close the provider spend without
--    re-deciding the quota outcome (steward review, item 3).
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_usage_reservations (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key         text          NOT NULL,
  subject_key         text          NOT NULL,
  daily_bucket_id     uuid          NOT NULL REFERENCES public.checker_quota_buckets (id),
  allowance_bucket_id uuid          NOT NULL REFERENCES public.checker_quota_buckets (id),
  budget_bucket_id    uuid          REFERENCES public.checker_budget_buckets (id),
  state               text          NOT NULL DEFAULT 'reserved',
  -- Settled copy of the analysed outcome (completed/limited/unavailable), kept
  -- so reconciliation can close spend without re-deciding the quota outcome.
  -- Not a second vocabulary: same values as scam_checks.analysis_status.
  outcome_status      text,
  reserved_amount     numeric(20,8) NOT NULL DEFAULT 0,
  actual_amount       numeric(20,8),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  lease_expires_at    timestamptz   NOT NULL,
  settled_at          timestamptz,
  CONSTRAINT checker_usage_reservations_request_unique UNIQUE (request_key),
  CONSTRAINT checker_usage_reservations_request_key CHECK (
    length(btrim(request_key)) > 0 AND length(request_key) <= 128
  ),
  CONSTRAINT checker_usage_reservations_subject CHECK (
    length(btrim(subject_key)) > 0 AND length(subject_key) <= 128
  ),
  CONSTRAINT checker_usage_reservations_state CHECK (
    state IN ('reserved','completed','released','reconciliation_required')
  ),
  CONSTRAINT checker_usage_reservations_outcome CHECK (
    outcome_status IS NULL OR outcome_status IN ('completed','limited','unavailable')
  ),
  CONSTRAINT checker_usage_reservations_distinct_buckets CHECK (
    daily_bucket_id <> allowance_bucket_id
  ),
  CONSTRAINT checker_usage_reservations_amounts CHECK (
    reserved_amount >= 0 AND (actual_amount IS NULL OR actual_amount >= 0)
  ),
  CONSTRAINT checker_usage_reservations_lease CHECK (lease_expires_at > created_at)
);
CREATE INDEX checker_usage_reservations_subject_idx ON public.checker_usage_reservations (subject_key);
CREATE INDEX checker_usage_reservations_state_idx ON public.checker_usage_reservations (state);
-- The ownership FKs and the account-deletion path scan these two columns.
CREATE INDEX checker_usage_reservations_daily_idx ON public.checker_usage_reservations (daily_bucket_id);
CREATE INDEX checker_usage_reservations_allowance_idx ON public.checker_usage_reservations (allowance_bucket_id);

-- ============================================================================
-- ROW LEVEL SECURITY
--   * RLS enabled and forced on every table.
--   * authenticated users read only their own row AND only while the parent
--     check is unexpired (steward review, item 1) — this now includes
--     findings, history and feedback, not only checks.
--   * No INSERT/UPDATE/DELETE policy for authenticated/anon; browser write
--     grants are revoked explicitly.
--   * events/quota/budget/reservations are server-internal: service-role only.
-- ============================================================================
ALTER TABLE public.scam_checks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scam_findings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_feedback            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_quota_buckets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_budget_buckets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_reservations  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scam_checks                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scam_findings               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_history             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_feedback            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_events        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_quota_buckets       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_budget_buckets      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_reservations  FORCE ROW LEVEL SECURITY;

CREATE POLICY scam_checks_select_own ON public.scam_checks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND expires_at > now());

-- Dependents are readable only while their parent check is unexpired and owned.
CREATE POLICY scam_findings_select_own ON public.scam_findings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.scam_checks c
      WHERE c.id = scam_findings.check_id
        AND c.user_id = auth.uid()
        AND c.expires_at > now()
    )
  );

CREATE POLICY checker_history_select_own ON public.checker_history
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.scam_checks c
      WHERE c.id = checker_history.check_id
        AND c.user_id = auth.uid()
        AND c.expires_at > now()
    )
  );

CREATE POLICY checker_feedback_select_own ON public.checker_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.scam_checks c
      WHERE c.id = checker_feedback.check_id
        AND c.user_id = auth.uid()
        AND c.expires_at > now()
    )
  );

-- Browser writes: no policy exists, and the grants are removed explicitly.
REVOKE ALL ON public.scam_checks            FROM anon, authenticated;
REVOKE ALL ON public.scam_findings          FROM anon, authenticated;
REVOKE ALL ON public.checker_history        FROM anon, authenticated;
REVOKE ALL ON public.checker_feedback       FROM anon, authenticated;
REVOKE ALL ON public.checker_usage_events   FROM anon, authenticated;
REVOKE ALL ON public.checker_quota_buckets  FROM anon, authenticated;
REVOKE ALL ON public.checker_budget_buckets FROM anon, authenticated;
REVOKE ALL ON public.checker_usage_reservations FROM anon, authenticated;

GRANT SELECT ON public.scam_checks      TO authenticated;
GRANT SELECT ON public.scam_findings    TO authenticated;
GRANT SELECT ON public.checker_history  TO authenticated;
GRANT SELECT ON public.checker_feedback TO authenticated;

REVOKE ALL ON public.m4_utf16_units(text)        FROM PUBLIC;
REVOKE ALL ON public.m4_valid_highlights(jsonb)  FROM PUBLIC;
REVOKE ALL ON public.m4_valid_limitations(jsonb) FROM PUBLIC;
REVOKE ALL ON public.m4_valid_opaque_id(text, integer) FROM PUBLIC;
REVOKE ALL ON public.m4_history_matches_parent() FROM PUBLIC;

-- CHECK constraints and triggers evaluate as the inserting role, so the
-- server-only writer needs EXECUTE on the helpers it indirectly invokes.
GRANT EXECUTE ON FUNCTION public.m4_utf16_units(text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_valid_highlights(jsonb)       TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_valid_limitations(jsonb)      TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_valid_opaque_id(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.m4_history_matches_parent()      TO service_role;

-- Table privileges for the server-only writer. Supabase's default privileges
-- usually cover service_role, but relying on an implicit default would make this
-- migration non-self-contained; the SECURITY INVOKER functions need these
-- rights when called through the service-role client.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.scam_checks,
  public.scam_findings,
  public.checker_history,
  public.checker_feedback,
  public.checker_usage_events,
  public.checker_quota_buckets,
  public.checker_budget_buckets,
  public.checker_usage_reservations
TO service_role;

COMMIT;

-- ============================================================================
-- NOT in this migration (separate, gated):
--   * Nine-field event revision (`subject_ref`) — name agreed, migration to be
--     written; must land before per-user dashboard integration.
--   * Scheduled purge job — proposed; needs approval and a scheduler.
--   * Applying any of this: named implementer (steward) + Supabase access.
-- ============================================================================
