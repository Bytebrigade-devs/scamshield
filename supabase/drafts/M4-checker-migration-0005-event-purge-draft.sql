-- ============================================================================
-- M4 AI Scam Checker — migration 0005: event-purge schedule (revision 1, APPLIED)
-- ============================================================================
-- STATUS: APPLIED — 26 November 2026, once, by the owner in the Supabase SQL editor
--   (`Success. No rows returned`). The verify grid afterwards returned TWO `m4_purge-%`
--   jobs: `m4-purge-events-30d` @ `15 3 * * *` →
--   `SELECT public.m4_purge_events(now() - interval '30 days')`, and the pre-existing
--   `m4-purge-expired-checks` @ `0 3 * * *` → `SELECT public.m4_purge_expired(now())`.
--   DO NOT RE-RUN: a successful one-shot is never repeated.
--   HEADER CORRECTED 27 November 2026 — revision 1 shipped saying "DRAFT … NOT applied",
--   which stopped being true on 26 Nov. Only this header block changed. Adds ONE cron job
--   to the scheduler already enabled by 0004; it does not re-run 0004 and does not
--   touch a table, column, policy or constraint.
--
-- WHY A NEW FILE, NOT AN EDIT TO 0004: 0004 is APPLIED (its checks job went live
--   on 24 Nov 2026), and a successful one-shot migration is never re-run. Its
--   event-purge block was left commented out because the 30-day TTL was
--   provisional. Editing 0004 and applying it again would re-create the checks
--   job block and re-open a file that must stay byte-identical to what ran.
--
-- APPROVAL — BOTH GATES RECORDED (D4 required M5 + M1):
--   * M1 (Suraji, privacy): YES, 25 Nov 2026 — "acceptable from the privacy
--     perspective, provided the policy is documented and events remain
--     privacy-safe". Condition satisfied: design/M4-event-retention-policy.md.
--   * M5 (Vishmi, dashboard read-window): YES, 25 Nov 2026 — "30 days fully
--     covers Module 5's read-window (7-day rolling baselines and 30-day
--     operational telemetry). M5 does not require raw usage events older than
--     30 days."
--   Recorded in M4-TEAM-CONFIRMATIONS.md §12 and the retention policy §4.
--
-- WHAT THE JOB DOES: daily at 03:15 UTC (15 minutes after the checks purge),
--   DELETE FROM public.checker_usage_events WHERE occurred_at < now() - 30 days.
--   Returns the number of rows removed; quota counters are untouched, so a
--   purge never grants new checks.
--
-- PRIVILEGES: m4_purge_events is service_role-only. A pg_cron job runs as the
--   role that scheduled it; applied by the owner as postgres (superuser, bypasses
--   the EXECUTE restriction) the job can call it. If the applying actor is ever a
--   non-superuser, schedule it to run as service_role instead.
--
-- GATES before applying: (1) owner authorisation — the apply is a database
--   change to the main project; (2) approvals above (already recorded);
--   (3) dry-run first.
--
-- ONE-SHOT: opens with BEGIN, closes with COMMIT. The cron.schedule call is
--   guarded by jobname, so an accidental re-run cannot create a duplicate job —
--   but the convention stands: a successful apply is not repeated.
--
-- ROLLBACK: SELECT cron.unschedule('m4-purge-events-30d');  (removes the job;
--   nothing already purged comes back, and no schema object is involved)
--
-- HONESTY BOUNDARY: nothing here has been executed. The 30-day window is a
--   confirmed product/privacy decision, not a legal opinion; events are
--   pseudonymous (opaque subject_ref), not anonymous.
-- ============================================================================

BEGIN;

-- 1. Preconditions: pg_cron must be enabled (0004) and the purge helper must
--    exist (0003). Fail loudly rather than scheduling a job that cannot run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not enabled; apply 0004 first.';
  END IF;
  IF to_regprocedure('public.m4_purge_events(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'public.m4_purge_events(timestamptz) is missing; apply 0003 first.';
  END IF;
END $$;

-- 2. Schedule the 30-day event purge (approvals recorded 25 Nov 2026).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'm4-purge-events-30d') THEN
    PERFORM cron.schedule(
      'm4-purge-events-30d',
      '15 3 * * *',
      $cmd$ SELECT public.m4_purge_events(now() - interval '30 days') $cmd$
    );
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify after apply (read-only) — expect TWO rows: the checks job (0004) and
-- the event job (this file).
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'm4-purge-%';
--
-- Then close the loop on the retention record: the job is live, so the policy
-- document's "NOT enabled" status must be updated in the same pass.
-- ============================================================================
