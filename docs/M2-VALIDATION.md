# M2 local validation

## Resend hardening and full local pass — 28 November 2026

Scope: `POST /api/auth/confirmation-link` no longer trusts its `resend: true` body flag. Supabase's
`generateLink({ type: "signup" })` **creates** an unconfirmed account when the address is unknown —
the password passed to that call then works for sign-in once the account is confirmed. The route
therefore checks the credentials with `signInWithPassword` before generating a link: only
`email_not_confirmed` (existing account, correct password) continues; an unknown address, a wrong
password or an already-confirmed account all receive the same content-free
`200 {"ok":true,"expiresInSeconds":300}` with nothing created, generated or mailed. No public
entitlement, billing or schema behaviour changed.

Live evidence against the configured development project (throwaway accounts, deleted afterwards;
no tokens, links or passwords printed):

- `generateLink({ type: "signup" })` for an unknown address: HTTP 200, `action_link` present,
  user created with `email_confirmed_at = null`; `signInWithPassword` with the supplied password
  answered `email_not_confirmed`. This is the bug the probe closes.
- Existing unconfirmed user: `generateLink({ type: "signup" })` succeeded on the first and on a
  second (resend) call, returning the same user id. Resend itself is valid when the account exists.
- Wrong password on an unconfirmed account: `invalid_credentials`. Correct password:
  `email_not_confirmed`. The two are distinguishable, which is what makes the gate safe.
- `node scripts/check-otp-expiry.cjs --quick`: a freshly issued recovery code verified (HTTP 200,
  session issued).
- The **full** expiry run on the same project **failed**: a code issued 320 s earlier still verified,
  while `AUTH_OTP_EXPIRY_SECONDS` says 300, so the script exited 1. The project's email OTP window
  is therefore longer than the app claims (Supabase's default is 3600 s); set `mailer_otp_expiry` to
  300 seconds (or change the app value) before trusting the "5 minutes" copy or the countdown. The
  failed run also revealed that the script called `process.exit(1)`, skipping its `finally` cleanup
  and leaving two throwaway accounts behind; it now sets `process.exitCode` and returns so the
  accounts are always deleted, and the two leaked accounts were removed manually afterwards.
- `node scripts/check-resend.cjs`: key accepted, **0 verified domains**. `onboarding@resend.dev`
  can only deliver to the Resend account owner; any other recipient is refused with 403, so live
  auth mail is not production-ready until a sending domain is verified. The signup route reports
  that failure as a 502 and does not fall back to Supabase's mailer (fallback is 503-only).
- The fixed route was exercised end to end against the production build (`next start` on
  `127.0.0.1:3100`, throwaway accounts deleted afterwards): resend for an unknown address →
  `200 {"ok":true,"expiresInSeconds":300}` and **no account created**; resend for an existing
  unconfirmed account with the right password → probe and link generation succeeded, then Resend
  refused the mail (no verified domain) and the route answered 502 with the account left
  unconfirmed; the same address with a wrong password → the same 200 and no mail; a fresh signup
  whose confirmation mail failed → 502 with its account deleted (a later sign-in answered
  `invalid_credentials`).
- Live RLS and two-account isolation (two throwaway confirmed accounts, one service-role
  subscription row each, deleted afterwards): each account's direct `select` returned exactly one
  row and it was its own; direct `insert`, direct `update` of the other account's row and direct
  `delete` were all refused with `42501 permission denied for table subscriptions`; `GET
  /api/subscription` returned Sentinel for A and Guardian for B, each with `canRunCheck: true` and
  matching `user_id`; no token → 401 `Log in to manage your subscription.` The configured database
  therefore has the M2 schema, the select-only policy and the revoked browser grants in place.
- Live subscription write path, pre-merge (one throwaway confirmed account, deleted afterwards): no
  subscription initially (`canRunCheck: false`); `PUT` allocated the Sentinel trial with
  `billing_cycle: null` and exactly 7 days between `started_at` and `renews_at`; a second `PUT`
  answered 409; `POST` replaced the trial with Guardian monthly, active, `mocked: true`; `GET`
  then reported `canRunCheck: true`, 200 monthly and 15 daily checks; a declined mock payment
  answered 402 and changed nothing; `DELETE` set `cancelled` while keeping the plan, the same
  `renews_at` and `canRunCheck: true`; a plan change while that entitlement was valid answered 409;
  an unknown plan answered 400. `emailSent` was `false` because `TRIAL_EMAIL_FROM` is not set, so
  the trial-start email was not attempted.

Test suite: `pnpm test:recovery` reports **39 passed, 0 failed** — the previous 38 plus the admin-outage case from S1 below. The earlier 35 were the previous round plus three
regression cases (resend for an unknown address, resend with a wrong password, resend without an
anon key) and the unknown-address case rewritten around the real `generateLink` behaviour. The
file's test structure was also repaired: the expiry-window and Reply-To groups had been inserted
inside two unrelated signup tests, so they only ran as nested subtests and their parent assertions
sat in the wrong scope. They are now independent tests.

Other local results on the merged tree (`origin/main` at 5c8b5d8): `pnpm test:subscription` **35**
passed (the 34 from main plus the PGRST204 case below); `pnpm test:m2` 6 passed; `pnpm test:vault` 6
passed; `pnpm test:checker` 13/13 once a production build exists (its CSS guard skips with "no
production build found" otherwise); `pnpm typecheck` and ESLint clean; `pnpm build` passed on
Next.js 16.4.6 with **18 routes** (both auth routes and `/api/history` dynamic).

### Merged main — billing retry fixed — 28 November 2026

Merging `origin/main` brought the M2 billing ledger and the M4 checker (137 files). The merged tree
passed the suites, but the first live purchase answered **409**. With
`docs/m2-billing-schema-draft.sql` unapplied, PostgREST reports a missing column as **PGRST204**
("Could not find the 'auto_renew' column of 'subscriptions' in the schema cache"), not SQLSTATE
`42703`; `isMissingBillingSchema` only recognised 42703/42P01, so the access-only retry never ran.
It now treats a PGRST204 that names one of the four billing columns as the missing-migration case;
a PGRST204 naming any other column still fails 409. A regression test pins both.

Re-run on the rebuilt production app: `POST /api/subscription` → **200**, Guardian active,
`priceLkr: 990`, `billingRecorded: false`, `paymentRecorded: false` (the ledger table is also
unapplied), `GET` → 200 monthly / 15 daily checks, `DELETE` → cancelled with the same `renews_at`.

Not run: an actually delivered auth email, which needs a verified sending domain, and a browser
walkthrough of the backend-mode screens, because signup cannot complete while that domain is
missing. The full OTP expiry wait was run and **failed** (the window is longer than the declared
300 s), so the project setting must be corrected before the email copy and countdown can be
trusted.

### PR #81 review round — 28 November 2026

Review: **CHANGES REQUESTED**, 2 blocking + 4 should-fix. Fixed in this round unless noted.

- **B1 — the recovery contract is now measured, not assumed.** For a random address,
  `generateLink({ type: "recovery" })` answered **404 `user_not_found`** ("User with this email not
  found") and a following `listUsers` showed **no new row**. Unlike the signup variant, recovery
  does not create an account, so "unknown address = sent, nothing created" holds against the live
  project. No code gate was needed; this bullet is the evidence the review asked for.
- **B2 — signup no longer dead-ends on a 502.** The client fallback to Supabase's mailer now runs on
  **502 as well as 503**, for signup, resend and password recovery. A configured-but-unverified
  Resend sender therefore falls back to the project's mailer (subject to its SMTP setup and rate
  limits) instead of looping on "could not be sent". A fresh signup still deletes its account
  before Supabase's `signUp` recreates it, so no unusable row is left.
- **S1 — recovery admin failures are honest.** `generateLink` is treated as "no such address" only
  for a **404**. Any other status, a missing status or a thrown call now returns 502
  (`unavailable`), not the old fake `sent`. New test: 500 and an unknown-shape failure both answer
  502 and send nothing; `pnpm test:recovery` is now **39/39**.
- **S3 — the enumeration claim is narrowed** to the resend path in the route header; the signup
  path still returns 409, exactly as the code does.
- **S4 — limiter scope documented** in both route headers and `docs/M2-BACKEND.md`: the budget is
  per warm instance (N instances → N × budget) and the caller key reads the left-most
  `x-forwarded-for` entry, so it is a backstop, not a control; the per-address budget is the real
  anti-abuse bound.
- **Notes:** `.env.example` now comments out `AUTH_MAIL_DRIVER`/`AUTH_MAIL_OUTBOX` so the safe
  default is explicit; the no-same-origin-check rationale is in both route headers (a JSON body
  forces a CORS preflight the server never grants); the three files missing a trailing newline now
  have one.
- **S2 is still open and cannot be closed from this repository.** The live `verify:otp-expiry` run
  shows the project's window is longer than 300 s. Only the Supabase project setting
  (`mailer_otp_expiry`) or the deployed `AUTH_OTP_EXPIRY_SECONDS` can fix it, and no Management API
  credential exists in this workspace. Set Authentication → Email → Email OTP Expiration to 300
  seconds, then run `pnpm verify:otp-expiry` and replace this line with the pass. Until then the
  "5 minutes" copy is a known-wrong claim.

## Confirmation link for signup, emailed code for password reset — 21 November 2026

Scope: registration verification uses Supabase's emailed confirmation link (`signUp` with `emailRedirectTo`, plus a resend action for unconfirmed accounts). Password reset uses an emailed code that M2 issues itself: `POST /api/auth/recovery-code` calls the service-role admin API (`generateLink({ type: "recovery" })` → `email_otp`) and delivers it through Resend, then the browser exchanges it with `verifyOtp({ type: "recovery" })` and `/reset-password` sets the new password. This removes the reset flow's dependency on the Supabase project's SMTP settings. The code length is a Supabase project setting, not a constant — **this project issues 8 digits**, so nothing in the app may pin 6. No schema, entitlement or billing behaviour changed.

- Live verification against the real project (21 November 2026, throwaway user, deleted afterwards): `createUser` 200 → `generateLink({type:"recovery"})` returned `data.properties.email_otp` = an **8-digit** code with `verification_type: "recovery"` → `verifyOtp({email, token, type:"recovery"})` **issued a session** for that user → `deleteUser` 200. So code generation and the browser-side exchange are proven end to end; only mail delivery remains unproven.
- `node scripts/test-recovery.cjs`: **17 passed, 0 failed** — code never returned to the browser, unknown address indistinguishable from known and sends nothing, missing sender reported rather than faked, failed delivery reported as a failure, malformed address refused before any admin call, `GET` refused, rate limit on the fourth request, an 8-digit code emailed intact, the flat REST shape accepted as well as the SDK's `properties` shape, a malformed code answered with 502 rather than a silent success, the development outbox delivering with no mail provider, a **production build refusing the outbox driver and writing nothing**, and Resend taking precedence when both are configured. Runs as `pnpm test:recovery` and as a CI step.
- **Full flow verified live** on 21 November 2026 with a throwaway account (created, exercised, deleted; every step HTTP 200): `POST /api/auth/recovery-code` → `{"ok":true,"devChannel":"outbox"}` → an 8-digit code appeared in `.dev-outbox` → `verifyOtp({ type: "recovery" })` issued a session for that user → a new password was set with that session → login with the new password succeeded. Nothing was emailed; the development outbox carried the code. This proves every step except Resend delivery, which still needs `RESEND_API_KEY` and a verified sender.
- `node --experimental-strip-types --test tests/otp.test.ts`: **5 passed** (`pnpm test:m2`).
- `node scripts/test-subscription.cjs`: **28 passed** on this branch (the three billing-ledger cases live on `feat/m2-billing-ledger`).
- `tsc --noEmit`: passed. ESLint on every touched file: clean. `next build --webpack`: see below.
- Live check against the dev server on 127.0.0.1:3000: `POST /api/auth/recovery-code` returned **503** `{"error":"Email delivery is not configured on this server. Set RESEND_API_KEY and AUTH_EMAIL_FROM, then restart the server."}` — the honest failure this change exists to produce. Before it, the same situation returned a success message with no email sent.
- Not run: an actually delivered code. That needs `RESEND_API_KEY` and `AUTH_EMAIL_FROM` (or `TRIAL_EMAIL_FROM`) set on a Resend-verified sender, and the signup link additionally needs Supabase SMTP plus `{{ .ConfirmationURL }}` in the **Confirm sign up** template. Demo mode exercises the reset screen with the fixed code `000000` and sends nothing.

Honest limits: a 200 from `signUp` or from the recovery route means "accepted", and only the recovery route can now distinguish "not configured" (503) and "send failed" (502) from "sent". The rate limiter is in memory per process, so a restart clears it — stated in `src/lib/recovery-code.ts` rather than implied to be durable.

## Retry idempotency tests — 25 November 2026

Test-only round on the checkout/trial retry contract (PR #69, branch `test/m2-subscription-retry-idempotency`, authored by the M4 owner and merged under `GITHUB-GUIDE.md` §6 house rule 2). **No production code changed** — the route, SQL and schema are untouched.

- `node --test scripts/test-subscription.cjs`: **34 passed, 0 failed** (was 32). Two new cases: a **retried checkout after a lost response** returns **409** `"An entitlement is already valid…"` with exactly one `subscription_payments` insert and one `subscriptions` write; a **retried trial start** returns **409** `"Your one-time trial has already been allocated…"`, never inserts a second row and never writes a charge.
- Both retries re-read the row the first request committed; the harness gained a `statefulRead` option for this (a fixed fixture cannot model a retry). Its default behaviour is unchanged.
- Red-to-green checked by short-circuiting each guard in turn — `route.ts:86` and `:69` — which made the retry return **200** and the new tests fail; each mutation was reverted with `git checkout --`.
- `tsc --noEmit` and `eslint .`: exit 0. CI: `app-ci.yml` ubuntu + windows both **success** on the PR head.
- **Not run:** any live Supabase write. The harness is a double, not PostgREST, so this proves the route's decision order, not database behaviour.
- The 28-test (20 Nov) and 32-test (22 Nov) counts in the sections below are dated snapshots of their rounds and are not rewritten.

## PR #50 follow-up review — 22 November 2026

Fixes for the second review on `feat/m2-billing-ledger`: the missing-column fallback was only exercised on the insert branch, and the PR description contradicted the code. Commands run from the repository root on local Node v24.19.0; CI pins 24.22.1.

- `node scripts/test-subscription.cjs`: **32 passed, 0 failed** (was 31). New case: an existing, expired subscription (`current` set) checks out while the billing columns are missing (`42703`) — 200, `billingRecorded: false`, exactly two `update` writes on `subscriptions` and never an insert, the retry still carrying `plan` and `billing_cycle` while `price_lkr`, `currency`, `payment_method` and `auto_renew` are absent.
- `tsc --noEmit`: passed, no diagnostics. ESLint on `scripts/test-subscription.cjs`: clean.
- CI evidence for the head this review names, `b53224f`: `app-ci.yml` ran `Node 24 / ubuntu-latest` and `Node 24 / windows-latest`, both **success** (workflow run 44928061366, jobs 136918424615 and 136918424419). This commit is covered by the same workflow and its path filter.
- The PR description now states the degradation path (`billingRecorded: false`, access unaffected, `paymentRecorded` reported separately), says the draft may be applied before or after this code, and drops the claim that the write fails on unknown columns.

Not run: any live Supabase write. `docs/m2-billing-schema-draft.sql` is still unapplied, so the degradation path is exercised by the harness only, not against a database.

## PR #50 review round — 21 November 2026

Fixes for the review on `feat/m2-billing-ledger` (items 1–4 plus the minors). Commands run from the repository root on local Node v24.19.0; CI pins 24.22.1.

- `node scripts/test-subscription.cjs`: **31 passed, 0 failed** (was 28). New cases: a ledger failure still returns 200 with `paymentRecorded: false` and the subscription row intact and no card-data keys; checkout returns 200 with `billingRecorded: false` when the billing columns are missing (Postgres `42703`); a genuine write failure still returns 409, is not retried and records no charge.
- `tsc --noEmit`: passed, no diagnostics. ESLint on `src/app/api/subscription/route.ts` and `scripts/test-subscription.cjs`: clean.
- `next build --webpack`: compiled successfully, TypeScript check passed, 15 routes, empty stderr.
- CI: `app-ci.yml` ran `Node 24 / ubuntu-latest` and `Node 24 / windows-latest` on both `5f974bc` and `b53224f`, all four **success**. That workflow's path filter includes `src/**`, `scripts/**` and `package.json`, so this PR is covered by CI; only `m4-tests.yml` is scoped to `src/lib/scam-checker/**`.

Not run: any live Supabase write. `docs/m2-billing-schema-draft.sql` is still unapplied, so the degradation path is exercised by the harness only, not against a database.

## Current head validation — 20 November 2026

- `pnpm test:subscription`: 28 passed, zero failed.
- `pnpm typecheck`: passed; `pnpm lint`: clean.
- `pnpm build` on Next.js 16.4.6: passed; 14 routes, including the M2 screens and `/api/subscription`.
- Shared app CI (`.github/workflows/app-ci.yml`) runs install, lint, typecheck, the subscription suite, build and the vault test on ubuntu and windows.
- The sections below are historical evidence for earlier baselines, not this head.

## Current frontend demo validation — 26 October 2026

- All 23 automated policy, retained API and frontend dummy-state tests passed.
- TypeScript checks and the production build passed; all 11 pages generated successfully.
- The browser flow passed: signup, trial, keep/cancel, reset demo, saved dummy card, DEMO10 discount, declined and successful checkout, state after refresh, card removal, plan changes, expired scenario, logout/login and password-reset simulation.
- The complete browser flow made zero backend or payment requests. Full card numbers, security codes and passwords were absent from persisted demo data.
- Desktop and 375px mobile layouts were inspected. Mobile had no horizontal overflow. The production build's expired badge and plan action were checked after the final adjustment.
- This validates the frontend presentation only. No real account, payment, email, database or M4 integration is claimed. See `FRONTEND-DEMO.md` for the current flow.

## Earlier backend milestone

Date: 18 October 2026.

- Policy/API test runner: **16 passed**, zero failed. Covers access expiry, cancellation, trials, plan quotas, blocked states, malformed requests, mocked decline, forged identity/expiry, calendar billing and unauthenticated requests. API tests stub Supabase; they do not test the live database.
- TypeScript: passed with `tsc --noEmit --incremental false`.
- Production build: passed with Next.js 14.2.35; 11 generated pages including password recovery routes and dynamic subscription API.
- Rendered production UI: inspected pricing at narrow and wider panel widths, billing selection, checkout and missing-configuration error. Found and fixed Tailwind omission of dynamically assembled button/alert variant classes. Rebuilt successfully after the fix.
- Screenshot: `docs/evidence/pricing.png`, actual locally rendered pricing screen. It shows implementation, not a Figma design or a live payment.
- Not run: real Supabase registration/login, reset-email delivery, SQL execution, live RLS permissions, two-user isolation and M4 integration. These require the agreed development database and configuration.

No application changes were pushed, no PR was published, no shared database was changed, and no original project source files were replaced. This working copy contains the user's pre-existing UI edits as well as the interim implementation.
