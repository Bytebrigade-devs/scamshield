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
- Live subscription write path (one throwaway confirmed account, deleted afterwards): no
  subscription initially (`canRunCheck: false`); `PUT` allocated the Sentinel trial with
  `billing_cycle: null` and exactly 7 days between `started_at` and `renews_at`; a second `PUT`
  answered 409; `POST` replaced the trial with Guardian monthly, active, `mocked: true`; `GET`
  then reported `canRunCheck: true`, 200 monthly and 15 daily checks; a declined mock payment
  answered 402 and changed nothing; `DELETE` set `cancelled` while keeping the plan, the same
  `renews_at` and `canRunCheck: true`; a plan change while that entitlement was valid answered 409;
  an unknown plan answered 400. `emailSent` was `false` because `TRIAL_EMAIL_FROM` is not set, so
  the trial-start email was not attempted.

Test suite: `pnpm test:recovery` reports **38 passed, 0 failed** — the previous 35 plus three
regression cases (resend for an unknown address, resend with a wrong password, resend without an
anon key) and the unknown-address case rewritten around the real `generateLink` behaviour. The
file's test structure was also repaired: the expiry-window and Reply-To groups had been inserted
inside two unrelated signup tests, so they only ran as nested subtests and their parent assertions
sat in the wrong scope. They are now independent tests.

Other local results: `pnpm test:subscription` 28 passed; `pnpm test:m2` 6 passed;
`pnpm test:vault` 6 passed; `pnpm typecheck` passed; ESLint clean; `pnpm build` passed on
Next.js 16.4.6 with 16 routes (both auth routes dynamic).

Not run: an actually delivered auth email, which needs a verified sending domain, and a browser
walkthrough of the backend-mode screens, because signup cannot complete while that domain is
missing. The full OTP expiry wait was run and **failed** (the window is longer than the declared
300 s), so the project setting must be corrected before the email copy and countdown can be
trusted.

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
