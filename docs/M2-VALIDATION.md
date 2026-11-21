# M2 local validation

## PR #50 review round — 21 November 2026

Fixes for the review on `feat/m2-billing-ledger` (items 1–4 plus the minors). Commands run from the repository root on local Node v24.19.0; CI pins 24.22.1.

- `node scripts/test-subscription.cjs`: **31 passed, 0 failed** (was 28). New cases: a ledger failure still returns 200 with `paymentRecorded: false` and the subscription row intact and no card-data keys; checkout returns 200 with `billingRecorded: false` when the billing columns are missing (Postgres `42703`); a genuine write failure still returns 409, is not retried and records no charge.
- `tsc --noEmit`: passed, no diagnostics. ESLint on `src/app/api/subscription/route.ts` and `scripts/test-subscription.cjs`: clean.
- `next build --webpack`: compiled successfully, TypeScript check passed, 15 routes, empty stderr.
- CI on the previous head `5f974bc`: `app-ci.yml` ran `Node 24 / ubuntu-latest` and `Node 24 / windows-latest`, both **success**. That workflow's path filter includes `src/**`, `scripts/**` and `package.json`, so this PR is covered by CI; only `m4-tests.yml` is scoped to `src/lib/scam-checker/**`.

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
