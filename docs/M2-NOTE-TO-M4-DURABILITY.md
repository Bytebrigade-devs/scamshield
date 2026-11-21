# Note to M4: scheduling the durable half of the checker counters

**To** Svishwa (@Svishwa2004), M4 owner · **copied to** Prashnidha (@Prasnida), schema steward
**From** Lahiru Achintha, M2 owner
**Date** 21 November 2026
**Status** Request for scheduling. Nothing here is applied, approved or merged, and no M2 application code changes either way. This note records what M2 verified in the shared app on 21 November 2026 and asks M4 to sequence the two remaining items.

## 1. Why M2 is writing this

M2 exposes plan limits and identity; M4 owns the usage ledger. That boundary is unchanged and is not being reopened here. The open item is narrower: M4's counters are real but in-memory, and the two drafts that would make them durable are published and unapplied. Applying them is M4's call and the steward's work, not M2's, so M2 is only asking for a date and a sequence — and flagging one precondition that M2 found while checking the integration.

## 2. What is merged and working today

| Piece | State in `main` at `74d0958` |
| --- | --- |
| `/checker`, `/api/check`, `/api/feedback`, `/api/config` | mounted |
| Enforcement logic | `check-boundary.ts` gates monthly → daily → burst with reservations; only a completed analysis consumes quota and every other exit releases it (`check-boundary.ts:435-475`) |
| Request gate | `request-entitlement.ts` maps M2's decision to `demo` / `allowed` / `rejected` (401/403/503) and never downgrades a caller that claims identity |
| Persistence | in-memory and per process — `createInMemoryUsageStore()` and `createInMemoryPersistence()` at `check-service.ts:213` and `:217` |
| Supabase schema | `supabase/drafts/M4-checker-migration-0001-draft.sql` and `-0002-functions-draft.sql`, both self-declared **NOT APPLIED** |

## 3. What applying the drafts would and would not do

Applying the SQL alone changes **no observable behaviour**. The app constructs the in-memory stores at service construction, and no Supabase implementation of `UsagePort` or `persistence-port` exists in `src/`. So the durable half is two sequenced items, not one:

- **A1 — steward apply.** Review and apply `0001`, then `0002` (0002 depends on 0001; both are single `BEGIN … COMMIT` transactions). M4's own draft note names Prashnidha as the applier, requires the named implementer plus Supabase access, and proposes 22 November 2026 (`docs/m4-database-migrations-draft.md:22-25`). M2 restates its earlier offer to arrange the needed project access, which those notes already record as M2's step (`:23`).
- **A2 — the adapter.** A Supabase-backed `UsagePort` / `persistence-port` implementation, leaving `0002`'s transaction functions as the atomic unit. Until A2 lands, A1 is schema-only. M2 suggests A2 ships behind an explicit environment switch with the in-memory store as the default, so a missing or unreachable database degrades to today's behaviour instead of failing `/api/check`. New tests belong in the existing zero-dependency glob (`node --test "src/lib/scam-checker/**/*.test.ts"`, `.github/workflows/m4-tests.yml`).

## 4. One precondition M2 found: the counters are not per user

This is the part M2 can contribute, because it is an integration fact rather than an M4 design choice. Today **every** check is counted against one shared demo subject:

- `createCheckService` injects a fixed snapshot — `subjectKey: DEMO_SUBJECT_KEY`, `planId: 'trial'`, `status: 'trial'` (`check-service.ts:197-206`, session `local-ui-demo` at `:275`).
- M2's decision is used at the route to allow or reject the request and to key the feedback report (`api/check/route.ts:59-75`). The resolved `subjectKey` is not passed into `runCheck`, and `m2-entitlement-adapter.ts:19-20` deliberately does not trust M2's `limits` as a quota source.
- The checker page sends no `Authorization` header at all: `ui/public/app.js:529` posts `{text, sender}` only.

The consequence matters for scheduling, not for correctness: the one bucket is the trial allowance of `15 per month anchored at first use` (`check-boundary.ts:115-120`). Persisting that bucket as it stands would keep the shared count across restarts — so after 15 checks the checker would answer "The monthly check limit for your plan has been reached." for 30 days, restart or not, for every visitor. Today, restarting the process clears it.

M2 is not asking to reopen the boundary or the subject design. The ask is only that A2 is **not** switched on as the default until the caller's verified subject and plan reach `runCheck`, or that the lock risk above is accepted knowingly for a demo window. M2 is happy to supply the bearer-token plumbing for that hand-off on the M2 side if it is useful.

## 5. Impact on M2's schema: none

Checked against the drafts rather than assumed:

- No foreign key references `public.subscriptions` or any other M2 table. Ownership FKs point at `auth.users (id)` with `ON DELETE CASCADE`; every other FK stays inside M4's own tables.
- RLS is enabled and forced on M4's eight tables only; own-row `SELECT` policies cover checks, findings, history and feedback; the four server-internal tables (events, quota, budget, reservations) are service-role only.
- The `REVOKE` statements at `0001:312-323` name M4 tables only — no M2 grant is altered.

No M2 migration, policy or column changes, and no M2 application code changes, are needed to apply `0001`/`0002`.

## 6. What M2 will verify once the apply is reported

Read-only catalogue checks first, then one behaviour check. M2 will report results with the date and will not claim an apply it did not see.

```sql
-- expected: 8 rows
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('scam_checks','scam_findings','checker_history','checker_feedback',
                    'checker_usage_events','checker_quota_buckets','checker_budget_buckets',
                    'checker_usage_reservations');

-- expected: relrowsecurity and relforcerowsecurity true for all 8
select relname, relrowsecurity, relforcerowsecurity from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('scam_checks','scam_findings','checker_history','checker_feedback',
                  'checker_usage_events','checker_quota_buckets','checker_budget_buckets',
                  'checker_usage_reservations');

-- expected: m4_utf16_units plus the six m4_* transaction functions (7 rows)
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (proname = 'm4_utf16_units' or proname like 'm4\_%')
order by proname;

-- expected: no anon/authenticated grants on the four server-internal tables
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name like 'checker\_%';
```

Behaviour check, only meaningful after A2: complete two checks under one subject, restart the development server, and confirm the count still reads two. If A2 has not landed, M2 will say so rather than report the restart test as passed.

## 7. Nits noticed while reading the drafts

Low priority, for whoever applies them:

- `0001:333-334` still says the transaction functions are "to be drafted with the durable adapter (A2)", but `0002` already contains them. The note predates `0002`; the file could be reconciled at apply time.
- `0001:329` and `0002:23` still call the event reference column name "unagreed", while `0001:25-27` and `m4-database-migrations-draft.md:17` record `subject_ref` as the agreed name. One line of confirmation would stop the next migration being written against the wrong name.

## 8. What M2 is not asking for

- No change to M4's design, quota semantics, retention policy or RLS model.
- No M2 code written into M4's module, and no M2 merge of M4's files.
- No M2 change to `public.subscriptions` or any shared table.

M2 will not apply, merge or alter these drafts. Both remain M4's and the steward's to review, apply and implement.

## 9. How to reply

One line each is enough:

> **A1 (apply 0001 → 0002):** date / not yet (reason)
> **A2 (durable adapter behind a switch):** date / not yet (reason)
> **Subject keying before A2 becomes the default:** agreed / accept the shared-bucket risk instead
> **Owner / date:**

A date is more useful than silence, and M2 will record whichever answer arrives.