-- ============================================================================
-- M4 AI Scam Checker — migration 0004: purge scheduler (revision 1, APPLIED)
-- ============================================================================
-- STATUS: APPLIED — 24 November 2026, once, by the owner in the Supabase SQL editor
--   (returned `Success. No rows returned`). pg_cron was enabled by this file, and the
--   verify grid afterwards showed ONE job: `m4-purge-expired-checks` @ `0 3 * * *` →
--   `SELECT public.m4_purge_expired(now())`, command byte-matching this file.
--   DO NOT RE-RUN: a successful one-shot is never repeated.
--   HEADER CORRECTED 27 November 2026 — revision 1 shipped saying "DRAFT … NOT applied",
--   which stopped being true on 24 Nov. Only this header block changed.
--   Builds on the applied 0001 (rev 6), 0002 (rev 5) and 0003 (rev 1). Decision D4 (24 Nov 2026)
--   chose a DATABASE-SIDE
--   scheduler (pg_cron) because it is host-independent and survives the planned
--   host move (Netlify demo → Vercel shared app → possibly elsewhere); a host-side
--   cron would have to be rebuilt on every move.
--
-- THE D4 SPLIT (owner decision 24 Nov 2026):
--   * CHECKS purge — m4_purge_expired(now()) — is SCHEDULED here. It deletes checks
--     whose per-row expires_at has passed; that expiry is the already-agreed plan
--     retention window (sentinel/trial 30, guardian 90, aegis 180 days), so no new
--     retention decision is needed. Findings/history/feedback cascade via the FKs;
--     quota counters are untouched.
--   * EVENT purge — m4_purge_events(now() - interval '30 days') — is NOT scheduled.
--     The flat 30-day event TTL is PROVISIONAL: X-13 retention is unapproved and
--     needs M5's dashboard read-window + M1's privacy ratification. The schedule
--     line is left commented below; enable it ONLY after that approval is recorded.
--
-- GATES — how each one was satisfied at the 24 Nov apply (kept as the record):
--   1. pg_cron enabled on the project — SATISFIED: `create extension if not exists pg_cron`
--      below ran in this file (available 1.6.4 beforehand, not enabled).
--   2. Owner authorises the apply — SATISFIED: the paste was the authorisation.
--   3. Event-purge schedule needed the M5 + M1 TTL ratification — NOT SATISFIED at this
--      apply, which is why the EVENT purge was left commented out here. It was shipped
--      separately as 0005 on 26 Nov 2026 once both replies were on file (M1 25 Nov,
--      M5 25 Nov). Do not enable the commented block here; use 0005.
--
-- PRIVILEGES: m4_purge_expired / m4_purge_events are service_role-only. A pg_cron
--   job runs as the role that scheduled it; applied by the owner as postgres (a
--   superuser that bypasses the EXECUTE restriction) the job can call them. If the
--   apply actor is ever a non-superuser, schedule the job to run as service_role.
--   DRY-RUN this file before applying (the reviewer's standing commitment) — static
--   review alone cannot catch a keyword-level defect (see the 0001 rev-6 lesson).
--
-- ONE-SHOT: opens with BEGIN, closes with COMMIT. The cron.schedule calls are
--   guarded by jobname so an accidental re-run does not create duplicate jobs, but
--   the convention stands: a successful apply is not repeated.
--
-- HONESTY BOUNDARY: the checks job is OBSERVED in `cron.job` by direct query. Its first
--   execution at 03:00 UTC has NOT been observed — `cron.job_run_details` has not been
--   read — so no purge count is claimed anywhere in the records.
-- ============================================================================

BEGIN;

-- 1. Enable pg_cron (idempotent). On Supabase this creates the cron schema and the
--    schedule/unschedule functions. Available 1.6.4 on the target; not yet enabled.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule the CHECKS purge (agreed per-row plan retention). Daily at 03:00 UTC.
--    Guarded by jobname so a re-run cannot create a duplicate job.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'm4-purge-expired-checks') THEN
    PERFORM cron.schedule(
      'm4-purge-expired-checks',
      '0 3 * * *',
      $cmd$ SELECT public.m4_purge_expired(now()) $cmd$
    );
  END IF;
END $$;

-- 3. EVENT purge — NOT scheduled. The 30-day TTL is provisional (M5 + M1 owed).
--    Uncomment and apply ONLY after that ratification is recorded, e.g.:
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'm4-purge-events-30d') THEN
--     PERFORM cron.schedule(
--       'm4-purge-events-30d',
--       '15 3 * * *',
--       $cmd$ SELECT public.m4_purge_events(now() - interval '30 days') $cmd$
--     );
--   END IF;
-- END $$;

COMMIT;

-- ============================================================================
-- Verify after apply (read-only): the checks job exists, the event job does not.
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'm4-purge-%';
-- Expected: exactly one row, 'm4-purge-expired-checks'. The event job stays absent
--   until the TTL is ratified. The verify script (rev 7, blocks 16–17) proves the
--   purge helpers themselves run as service_role.
-- ============================================================================