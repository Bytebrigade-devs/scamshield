-- ============================================================================
-- M4 AI Scam Checker — durable persistence migration 0001 (DRAFT)
-- ============================================================================
-- STATUS: DRAFT for schema-steward review. NOT applied. No table, policy or
--   function here exists in any database. Team approval (19 Nov 2026) authorises
--   DRAFTING only; applying needs the named implementer + Supabase access, and
--   deployment stays separately gated.
--
-- SOURCES (authoritative):
--   * Steward design reply, 19 Nov 2026 — evidence/M4-prashni-db-design-reply-20261119.md
--     (eight snake_case tables, mappings, composite ownership FK, RLS model,
--      counters/reservations, feedback, storage/retention, UTF-16 snippet subtlety).
--   * Team approval, 19 Nov 2026 — evidence/M4-team-approval-20261119.md
--     (design + steward Prashni + retention rules + storage-scope direction approved).
--   * M2-J access rule, 18 Nov 2026 (own-row reads incl. read-only after expiry;
--     no browser writes; server-only service-role writes; account deletion cascades).
--   * App contract: code/boundary/persistence-port.ts (field shapes, validation,
--     quota semantics: ONLY completed consumes quota; limited/unavailable release).
--
-- DRAFT NOTES (M4 reconstruction, flagged for steward confirmation):
--   * Column names/types below follow the steward's recorded mappings + the port's
--     field shapes. Where her exact column list was not captured verbatim, the name
--     is M4's draft proposal (marked [draft]) and must be confirmed by the steward.
--   * The nine-field event revision is NOT included in this migration: `subject_ref` is
--     now the AGREED reference-column name (Vishmi/M5 and Lahiru/M2 on 19 Nov; the
--     steward on 20 Nov), but adding it stays a later, separately reviewed migration.
--     The event table keeps the CURRENT eight fields.
--   * Highlight semantics (exact excerpts, non-overlap, <=35% of reason) and finding
--     exact-excerpt/offset validation are APP-enforced (persistence-port.ts); the DB
--     enforces counts/shape only. Reason '' and NULL are both allowed (steward design).
--   * Dashboard-event read access + 30-day purge are PROPOSED, not approved; the
--     events table is service-role-only in this draft pending M5/M6 consumer review.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- UTF-16 code-unit length helper.
-- PostgreSQL length() counts characters (code points); the app counts UTF-16
-- units (a supplementary-plane emoji = 2 units). units = char_count + the number
-- of supplementary-plane characters. Used by the snippet (280) and reason (1000)
-- CHECKs so the DB limit matches the app's `.length` exactly.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 1. scam_checks — one row per accepted check (the row identity).
--    Submitted text and candidates are NOT persisted; reply is flattened;
--    rejected results are not stored.
-- ----------------------------------------------------------------------------
CREATE TABLE public.scam_checks (
  id               text        PRIMARY KEY,                 -- opaque check id (no whitespace)
  user_id          uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id          text        NOT NULL,                    -- sentinel/guardian/aegis/trial (lowercased by adapter)
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,                    -- immutable retention deadline (server-calculated)
  analysis_status  text        NOT NULL,
  analysis_mode    text        NOT NULL,
  category_id      text        NOT NULL,
  taxonomy_version text        NOT NULL,
  verdict_label    text,                                    -- NULL when no validated reply
  risk_level       text,                                    -- NULL when no reply
  reason           text,                                    -- NULL and '' both allowed; <= 1000 UTF-16 units
  reason_highlights jsonb      NOT NULL DEFAULT '[]'::jsonb,-- <= 4; {start,end,excerpt}; semantics app-enforced
  limitations      jsonb       NOT NULL DEFAULT '[]'::jsonb,-- <= 10 strings, each <= 1000 units (app-enforced)
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
  CONSTRAINT scam_checks_highlights_count CHECK (jsonb_typeof(reason_highlights) = 'array' AND jsonb_array_length(reason_highlights) <= 4),
  CONSTRAINT scam_checks_limitations_count CHECK (jsonb_typeof(limitations) = 'array' AND jsonb_array_length(limitations) <= 10),
  CONSTRAINT scam_checks_expiry_after_created CHECK (expires_at > created_at),
  CONSTRAINT scam_checks_id_no_whitespace CHECK (id !~ '\s')
);
-- Composite ownership target for findings/history/feedback.
CREATE UNIQUE INDEX scam_checks_id_user_idx ON public.scam_checks (id, user_id);
CREATE INDEX scam_checks_user_created_idx ON public.scam_checks (user_id, created_at DESC);
CREATE INDEX scam_checks_expires_idx ON public.scam_checks (expires_at);

-- ----------------------------------------------------------------------------
-- 2. scam_findings — rule evidence (offsets against the analysed input).
-- ----------------------------------------------------------------------------
CREATE TABLE public.scam_findings (
  id           text        PRIMARY KEY,
  check_id     text        NOT NULL,
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  rule_id      text        NOT NULL,
  excerpt      text        NOT NULL,                       -- exact substring; validation app-enforced
  start_offset integer     NOT NULL,                       -- UTF-16 offset into analysed input
  end_offset   integer     NOT NULL,
  context_note text,                                       -- optional, <= 1000 (app-enforced)
  CONSTRAINT scam_findings_ownership_fk FOREIGN KEY (check_id, user_id)
    REFERENCES public.scam_checks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT scam_findings_offsets CHECK (start_offset >= 0 AND end_offset > start_offset),
  CONSTRAINT scam_findings_excerpt_len CHECK (public.m4_utf16_units(excerpt) <= 2000)
);
CREATE INDEX scam_findings_check_idx ON public.scam_findings (check_id);

-- ----------------------------------------------------------------------------
-- 3. checker_history — user-visible history row (written in the same transaction).
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_history (
  id            text        PRIMARY KEY,
  check_id      text        NOT NULL,
  user_id       uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id       text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  snippet       text        NOT NULL,                      -- <= 280 UTF-16 units, non-empty after trim
  verdict_label text        NOT NULL,
  category_id   text        NOT NULL,
  CONSTRAINT checker_history_ownership_fk FOREIGN KEY (check_id, user_id)
    REFERENCES public.scam_checks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT checker_history_snippet_len CHECK (public.m4_utf16_units(snippet) <= 280 AND length(btrim(snippet)) > 0),
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

-- ----------------------------------------------------------------------------
-- 4. checker_feedback — "Report a wrong result" (one row per owned check).
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_feedback (
  id          text        PRIMARY KEY,
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
-- 5. checker_usage_events — the CURRENT eight-field m4.check_outcome contract.
--    No user reference column: the nine-field revision's name is unagreed.
--    Service-role-only in this draft; consumer read access + 30-day purge pending.
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
--    Only completed analyses increment completed_count; reservations are released
--    on limited/unavailable. Counters are NEVER reset by history/account deletion.
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_quota_buckets (
  id              text        PRIMARY KEY,
  subject_key     text        NOT NULL,
  period_kind     text        NOT NULL,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  completed_count integer     NOT NULL DEFAULT 0,
  reserved_count  integer     NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checker_quota_buckets_period CHECK (period_kind IN ('daily','monthly','trial')),
  CONSTRAINT checker_quota_buckets_counts CHECK (completed_count >= 0 AND reserved_count >= 0),
  CONSTRAINT checker_quota_buckets_window CHECK (period_end > period_start),
  CONSTRAINT checker_quota_buckets_unique UNIQUE (subject_key, period_kind, period_start)
);

-- ----------------------------------------------------------------------------
-- 7. checker_budget_buckets — provider-spend counters (numeric(20,8)).
--    Spending stays disabled until funding permits live calls.
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_budget_buckets (
  id             text          PRIMARY KEY,
  budget_key     text          NOT NULL,
  period_start   timestamptz   NOT NULL,
  period_end     timestamptz   NOT NULL,
  currency       text          NOT NULL,
  limit_amount   numeric(20,8) NOT NULL DEFAULT 0,
  reserved_amount numeric(20,8) NOT NULL DEFAULT 0,
  spent_amount   numeric(20,8) NOT NULL DEFAULT 0,
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT checker_budget_buckets_amounts CHECK (limit_amount >= 0 AND reserved_amount >= 0 AND spent_amount >= 0),
  CONSTRAINT checker_budget_buckets_window CHECK (period_end > period_start),
  CONSTRAINT checker_budget_buckets_unique UNIQUE (budget_key, period_start)
);

-- ----------------------------------------------------------------------------
-- 8. checker_usage_reservations — atomic admission unit (unique request_key).
--    States: reserved -> completed | released | reconciliation_required.
-- ----------------------------------------------------------------------------
CREATE TABLE public.checker_usage_reservations (
  id                text          PRIMARY KEY,
  request_key       text          NOT NULL,
  subject_key       text          NOT NULL,
  daily_bucket_id   text          NOT NULL REFERENCES public.checker_quota_buckets (id),
  allowance_bucket_id text        NOT NULL REFERENCES public.checker_quota_buckets (id),
  budget_bucket_id  text          REFERENCES public.checker_budget_buckets (id),
  state             text          NOT NULL DEFAULT 'reserved',
  reserved_amount   numeric(20,8) NOT NULL DEFAULT 0,
  actual_amount     numeric(20,8),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  lease_expires_at  timestamptz   NOT NULL,
  settled_at        timestamptz,
  CONSTRAINT checker_usage_reservations_request_unique UNIQUE (request_key),
  CONSTRAINT checker_usage_reservations_state CHECK (
    state IN ('reserved','completed','released','reconciliation_required')
  ),
  CONSTRAINT checker_usage_reservations_amounts CHECK (reserved_amount >= 0 AND (actual_amount IS NULL OR actual_amount >= 0))
);
CREATE INDEX checker_usage_reservations_subject_idx ON public.checker_usage_reservations (subject_key);
CREATE INDEX checker_usage_reservations_state_idx ON public.checker_usage_reservations (state);

-- ============================================================================
-- ROW LEVEL SECURITY (M2-J + steward design)
--   * RLS on every table; FORCE so table owners are also subject.
--   * authenticated users SELECT only their own unexpired rows (checks/history);
--     feedback selects own rows (retention cascades with the check).
--   * NO insert/update/delete policies for authenticated or anon -> browser writes
--     denied by default. Privileged writes go through the server-only service_role
--     client (BYPASSRLS) AFTER session/ownership/entitlement/input verification.
--   * events/quota/budget/reservations are server-internal: service-role only.
--   * service_role keeps full access (Supabase default; bypasses RLS by design).
-- ============================================================================
ALTER TABLE public.scam_checks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scam_findings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_feedback       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_quota_buckets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_budget_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scam_checks            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scam_findings          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_history        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_feedback       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_events   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_quota_buckets  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_budget_buckets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checker_usage_reservations FORCE ROW LEVEL SECURITY;

-- Own-row, unexpired reads for the user-facing tables.
CREATE POLICY scam_checks_select_own ON public.scam_checks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND expires_at > now());

CREATE POLICY checker_history_select_own ON public.checker_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND expires_at > now());

CREATE POLICY checker_feedback_select_own ON public.checker_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Findings are read only through their parent check's ownership; expose own-row reads.
CREATE POLICY scam_findings_select_own ON public.scam_findings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Explicitly remove browser write grants (RLS already denies; this makes intent clear
-- and matches M2's migration pattern). service_role retains full access.
REVOKE INSERT, UPDATE, DELETE ON public.scam_checks            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scam_findings          FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.checker_history        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.checker_feedback       FROM anon, authenticated;
REVOKE ALL ON public.checker_usage_events        FROM anon, authenticated;
REVOKE ALL ON public.checker_quota_buckets       FROM anon, authenticated;
REVOKE ALL ON public.checker_budget_buckets      FROM anon, authenticated;
REVOKE ALL ON public.checker_usage_reservations  FROM anon, authenticated;
REVOKE ALL ON public.scam_checks            FROM anon;
REVOKE ALL ON public.scam_findings          FROM anon;
REVOKE ALL ON public.checker_history        FROM anon;
REVOKE ALL ON public.checker_feedback       FROM anon;

COMMIT;

-- ============================================================================
-- NOT in this migration (separate, gated):
--   * Nine-field event revision (opaque reference column) — name unagreed.
--   * Scheduled purge job (expired checks/history; proposed 30-day event purge) —
--     needs approval + a scheduler (pg_cron / edge function); semantics: physical
--     delete of expired rows, counters never reset.
--   * Transaction functions for atomic reserve/settle (the port's semantics) —
--     to be drafted with the durable adapter (A2) and reviewed by the steward.
--   * Applying any of this: named implementer + Supabase access + deployment gate.
-- ============================================================================
