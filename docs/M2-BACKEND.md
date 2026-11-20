# M2 backend connection — 7 November 2026

The saved team design uses Next.js App Router, TypeScript and Supabase Auth/PostgreSQL. The existing API is now connected to the UI. Backend mode is the default; set NEXT_PUBLIC_M2_MODE=demo to restore the interim presentation. Restart Next.js after changing this build-time public setting. There is no automatic fallback to demo data when authentication or the server fails.

## Setup

1. Copy .env.example to .env.local and provide the Supabase URL, anon key and server-only service role key. Keep the latter out of browser code and source control.
2. Review docs/m2-schema.sql with the team schema steward, then apply it to the development Supabase project. Existing legacy Free/Premium records require an agreed migration; the SQL intentionally aborts rather than converting them.
3. Enable email/password Auth. Set Site URL and allow the site's /account/subscription and /reset-password redirect URLs. Configure custom SMTP in Supabase Auth settings for delivery to ordinary user addresses; Supabase's default mailer is restricted to pre-authorized team addresses. The reset form uses `resetPasswordForEmail` and does not send email in demo mode.
   To send trial-start confirmations, optionally configure `RESEND_API_KEY` and `TRIAL_EMAIL_FROM` with a verified sender domain. If these are missing or delivery fails, the trial still starts and the account page reports that no confirmation email was sent.
4. Run pnpm dev. Sign up, confirm email, log in, start a trial, inspect subscription, cancel, and test recovery email/password replacement.
5. Verify two accounts cannot read each other's subscriptions and direct browser database writes are denied. These checks require a configured Supabase project and have not been run locally.

## API

All requests use Authorization: Bearer <Supabase access token>. The server verifies identity using auth.getUser(token), reads only that user's row, and derives trial and paid expiry on the server. The browser never supplies authoritative identity, access status or expiry.

| Method and endpoint | Behavior |
| --- | --- |
| GET /api/subscription | Own subscription and authoritative entitlement decision |
| PUT /api/subscription | One trial, seven days anchored at signup |
| POST /api/subscription | Mock purchase: plan, billingCycle, scenario; optional paymentMethod/promoCode |
| DELETE /api/subscription | Cancel while preserving access until expiry |

The server role performs writes; authenticated clients can only read their own subscription through RLS. Errors fail closed. Responses are not cached. A valid paid entitlement cannot currently change plan; the UI hides that demo-only action in backend mode. Cancelled plans expire at the same timestamp; there is no automatic renewal.

When a trial is allocated, the backend sends a transactional email to the verified account email through Resend, if configured. It includes the expiry in Sri Lanka time and the 15-total / 5-per-day check allowance. This message is informational; M4 still owns atomic usage enforcement.

## Payment and usage boundaries

Payments remain simulated by project requirement. A successful test checkout grants a persisted mock entitlement. This is a development/demo backend, not verified commercial billing. No live gateway or webhook is present. Checkout collects no card details at all: there is no number, expiry or security-code field, and the request carries only the plan, billing cycle, scenario and an optional promo code. Saved-card UI, DEMO10 discount, demo reset controls and invented usage counters are disabled in backend mode. Backend promo codes are unavailable.

M4 must enforce usage limits atomically and call the server entitlement helper for each protected action. M2 exposes plan limits but has no usage ledger; billing is unrelated to the safety score. No shared schema or remote database was changed during this connection work.

## Validation

Run pnpm test:subscription, pnpm typecheck, and pnpm build. Local tests use mocked Supabase responses; they do not establish live database permissions, email delivery or payment processing.

Auth integration follows the Supabase API: https://supabase.com/docs/reference/javascript/auth-getuser and https://supabase.com/docs/guides/auth/passwords.

Local verification on 20 November 2026: 28 subscription tests passed; typecheck and lint are clean; the production build succeeded on Next.js 16.4.6 with 14 routes, including every M2 screen and `/api/subscription`. Live Supabase, email and RLS verification still needs configured credentials wherever it runs.
