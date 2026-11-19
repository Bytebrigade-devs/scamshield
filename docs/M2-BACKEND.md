# M2 backend connection — 7 November 2026

The saved team design uses Next.js App Router, TypeScript and Supabase Auth/PostgreSQL. The existing API is now connected to the UI. Backend mode is the default; set NEXT_PUBLIC_M2_MODE=demo to restore the interim presentation. Restart Next.js after changing this build-time public setting. There is no automatic fallback to demo data when authentication or the server fails.

## Setup

1. Copy .env.example to .env.local and provide the Supabase URL, anon key and server-only service role key. Keep the latter out of browser code and source control.
2. Review docs/m2-schema.sql with the team schema steward, then apply it to the development Supabase project. Existing legacy Free/Premium records require an agreed migration; the SQL intentionally aborts rather than converting them.
3. Enable email/password Auth. Set Site URL and allow the site's /account/subscription and /reset-password redirect URLs. Configure email delivery and confirm a test account.
4. Run npm run dev. Sign up, confirm email, log in, start a trial, inspect subscription, cancel, and test recovery email/password replacement.
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

## Payment and usage boundaries

Apply `docs/m2-test-payments.sql` after the subscriptions schema. Backend checkout now records synthetic payments in `public.m2_test_payments` and debits the selected fixture in `public.m2_test_cards`. The service-only `m2_pay_test_subscription` function saves the subscription, balance deduction and transaction in one database transaction. It derives prices from the approved plan/cycle, locks the selected balance and serializes each user's purchases. Repeating the same request ID returns the original transaction. Insufficient funds and conflicting purchases leave the balance and subscription unchanged.

The fixture balances are shared across users of each named test card. Their balances and payment tables are accessible only to the server role, and checkout does not display balances. Payment records retain the synthetic card ID, amount, plan and cycle. They contain no full card number, expiry or security code. Account deletion removes the user reference from these test payment records. The optional service-only backfill flag records an explicitly confirmed earlier purchase once using its original subscription dates.

Payments remain simulated by project requirement. A successful test checkout grants a persisted mock entitlement. This is a development/demo backend, not verified commercial billing. No live gateway or webhook is present. Card fields accept synthetic details only; full number and security code never enter API requests or storage. Saved-card UI, DEMO10 discount, demo reset controls and invented usage counters are disabled in backend mode. Backend promo codes are unavailable.

M4 must enforce usage limits atomically and call the server entitlement helper for each protected action. M2 exposes plan limits but has no usage ledger; billing is unrelated to the safety score. No shared schema or remote database was changed during this connection work.

## Validation

Run npm run test:subscription, npm run typecheck, and npm run build. Local tests use mocked Supabase responses; they do not establish live database permissions, email delivery or payment processing.

Auth integration follows the Supabase API: https://supabase.com/docs/reference/javascript/auth-getuser and https://supabase.com/docs/guides/auth/passwords.

Local verification on 7 November: 26 tests passed; TypeScript passed. Production build was attempted: the existing .next directory denied a write, and an isolated retry stopped because fonts.googleapis.com could not resolve. Temporary build configuration was restored. No .env.local is present; live Supabase/email/RLS verification is pending setup.
