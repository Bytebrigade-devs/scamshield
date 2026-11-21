# M2 local validation

## Confirmation link for signup, emailed code for password reset — 21 November 2026

Scope: registration verification uses Supabase's emailed confirmation link (`signUp` with `emailRedirectTo`, plus a resend action for unconfirmed accounts); password reset uses a 6-digit emailed code (`resetPasswordForEmail` → `verifyOtp({ type: "recovery" })` → `/reset-password`). No schema, entitlement or billing behaviour changed.

- `node --experimental-strip-types --test tests/otp.test.ts`: **5 passed, 0 failed** (input normalisation, short-code refusal, error-code wording, unconfirmed-email detection, demo code shape). Runs as `pnpm test:m2` and as a CI step in `.github/workflows/app-ci.yml`.
- `tsc --noEmit`: passed. ESLint on every touched file: clean.
- `next build --webpack` on Next.js 16.4.6: passed, 15 routes, clean stderr.
- Not run: a live round-trip of either email. That needs the project's SMTP configured (Resend: `smtp.resend.com`, user `resend`, password = API key) plus the two templates — `{{ .ConfirmationURL }}` for **Confirm sign up**, `{{ .Token }}` for **Reset password**. Until then the app can request mail and Supabase can accept the request, but nothing is delivered. Demo mode exercises the reset screen with the fixed code `000000` and sends nothing.

Honest limits: a 200 from `resetPasswordForEmail` or `signUp` means "request accepted", not "email sent", so no screen claims delivery; Authentication → Logs is the place to confirm mailer activity.

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
