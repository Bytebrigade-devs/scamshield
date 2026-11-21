# M2 local validation

## Confirmation link for signup, emailed code for password reset — 21 November 2026

Scope: registration verification uses Supabase's emailed confirmation link (`signUp` with `emailRedirectTo`, plus a resend action for unconfirmed accounts). Password reset uses an emailed code that M2 issues itself: `POST /api/auth/recovery-code` calls the service-role admin API (`generateLink({ type: "recovery" })` → `email_otp`) and delivers it through Resend, then the browser exchanges it with `verifyOtp({ type: "recovery" })` and `/reset-password` sets the new password. This removes the reset flow's dependency on the Supabase project's SMTP settings. The code length is a Supabase project setting, not a constant — **this project issues 8 digits**, so nothing in the app may pin 6. No schema, entitlement or billing behaviour changed.

- Live verification against the real project (21 November 2026, throwaway user, deleted afterwards): `createUser` 200 → `generateLink({type:"recovery"})` returned `data.properties.email_otp` = an **8-digit** code with `verification_type: "recovery"` → `verifyOtp({email, token, type:"recovery"})` **issued a session** for that user → `deleteUser` 200. So code generation and the browser-side exchange are proven end to end; only mail delivery remains unproven.
- `node scripts/test-recovery.cjs`: **14 passed, 0 failed** — code never returned to the browser, unknown address indistinguishable from known and sends nothing, missing sender reported rather than faked, failed delivery reported as a failure, malformed address refused before any admin call, `GET` refused, rate limit on the fourth request, an 8-digit code emailed intact, the flat REST shape accepted as well as the SDK's `properties` shape, and a malformed code answered with 502 rather than a silent success. Runs as `pnpm test:recovery` and as a CI step.
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
