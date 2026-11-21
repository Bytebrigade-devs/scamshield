# M2 local validation

## Checker usage read-back — 21 November 2026

Scope: M4's read-only `GET /api/usage`, the shared per-process checker service, and the M2 account-page card. No M2 subscription, entitlement or schema behaviour changed.

- `node --test "src/lib/scam-checker/**/*.test.ts"`: **571 passed, 0 failed** (9 new tests: 5 usage-store read-view, 2 check-service, 2 route-service).
- `tsc --noEmit`: passed. ESLint on every touched file: clean.
- `next build --webpack` on Next.js 16.4.6: passed with **15 routes**; `/api/usage` is dynamic (`ƒ`).
- Production `next start` smoke test (`127.0.0.1:3123`):
  - `GET /api/usage` → `200`, `cache-control: no-store`, `content-type: application/json`; `used 0`, `started 0`, `limit 15`, `remaining 15`, `providerConfigured false`, `windowStartsAt null`.
  - Two `POST /api/check` calls, both `analysed / limited / rules_only`, then `GET /api/usage` → `started 2`, `used 0`, `inFlight 0`, `windowStartsAt` set to the first admission. This proves `/api/check` and `/api/usage` share one store, and that a rules-only result never consumes quota.
- A fresh `next start` process reported the counters at zero again, confirming the documented per-process limitation rather than a durable ledger.

Not run: browser rendering of the account-page card (needs a signed-in session), live Supabase, RLS checks. M4's `supabase/drafts/M4-checker-migration-0001-draft.sql` / `-0002-functions-drafts` remain **unapplied**, and no Supabase `UsagePort` adapter exists, so the counters are still in memory per process. The endpoint and card say so in words; they must not be presented as per-account usage.

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
