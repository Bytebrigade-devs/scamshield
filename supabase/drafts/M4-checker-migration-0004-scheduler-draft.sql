-- ============================================================================
-- M4 AI Scam Checker — migration 0004: purge scheduler (DRAFT, revision 1)
-- ============================================================================
-- STATUS: DRAFT for review. NOT applied. Builds on the applied 0001 (rev 6),
--   0002 (rev 5) and 0003 (rev 1). Decision D4 (24 Nov 2026) chose a DATABASE-SIDE
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
-- GATES before this file may be applied (all stop gates, owner go-ahead required):
--   1. pg_cron must be enabled on the project (available 1.6.4, not enabled as of
--      24 Nov). `create extension if not exists pg_cron` below performs that.
--   2. The owner authorises the apply (a database change to the main project).
--   3. The event-purge schedule additionally needs the M5 + M1 TTL ratification.
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
-- HONESTY BOUNDARY: nothing here has been executed. pg_cron is not enabled on the
--   target yet; this is a proposal for the owner to dry-run and apply under go-ahead.
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