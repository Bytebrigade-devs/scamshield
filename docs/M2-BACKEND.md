# M2 backend connection — 7 November 2026

The saved team design uses Next.js App Router, TypeScript and Supabase Auth/PostgreSQL. The existing API is now connected to the UI. Backend mode is the default; set NEXT_PUBLIC_M2_MODE=demo to restore the interim presentation. Restart Next.js after changing this build-time public setting. There is no automatic fallback to demo data when authentication or the server fails.

## Setup

1. Copy .env.example to .env.local and provide the Supabase URL, anon key and server-only service role key. Keep the latter out of browser code and source control.
2. Review docs/m2-schema.sql with the team schema steward, then apply it to the development Supabase project. Existing legacy Free/Premium records require an agreed migration; the SQL intentionally aborts rather than converting them.
3. Enable email/password Auth and the email provider. Registration is verified with an emailed **confirmation link**; password reset uses an emailed **code** (owner decision, 21 November 2026). The code length is a Supabase project setting — this project issues 8 digits — so the UI accepts 6 to 10 and never pins one length.
   - `/signup` calls `signUp` with `emailRedirectTo: <origin>/account/subscription`. The user confirms by clicking the link, then logs in. A login from an unconfirmed account shows a "Resend confirmation email" action (`auth.resend({ type: "signup" })`) instead of failing.
   - `/forgot-password` calls M2's own `POST /api/auth/recovery-code`. That route generates the code with the service-role admin API (`generateLink({ type: "recovery" })` → `email_otp`) and emails it through Resend, so the reset code does **not** depend on the Supabase project's SMTP settings. The code step then calls `verifyOtp({ type: "recovery" })`, and the session that returns is what lets `/reset-password` set the new password. That screen still accepts a `PASSWORD_RECOVERY` link session, so a link-based recovery template keeps working too.
   **The two flows use different senders**, and both are configuration rather than application code:
   - *Signup confirmation link* — sent by Supabase, so Authentication → SMTP Settings must be configured and the **Confirm sign up** template must contain `{{ .ConfirmationURL }}`. Supabase's built-in mailer only delivers to pre-authorised team addresses and is rate limited, so a request can return success while nothing reaches an ordinary address; Authentication → Logs records the request and any mailer error.
   - *Password reset code* — sent by M2 through the Resend HTTP API, so it needs `RESEND_API_KEY` plus `AUTH_EMAIL_FROM` (falling back to `TRIAL_EMAIL_FROM`) in the server environment, on a domain verified with Resend. The Supabase **Reset password** template is not used by this flow. Without those variables the route answers 503 "Email delivery is not configured on this server", and the form shows that verbatim instead of claiming a code was sent.
   Reset-code safety: the code is never returned to the browser and never logged; an unknown address gets the same `200 {"ok":true}` as a known one; and each address and caller is limited to 3 requests per 10 minutes by an in-memory limiter that a server restart clears.
   Local development without a mail sender: set `AUTH_MAIL_DRIVER=outbox` (optionally `AUTH_MAIL_OUTBOX`, default `.dev-outbox`, gitignored). The code is then written to that folder and printed in the server terminal instead of being emailed, and the response carries `devChannel: "outbox"` so the screen states plainly that nothing was emailed. A production build refuses this driver and returns 503 — a reset code is never written to disk in production.
   Resend SMTP for the signup link, per Resend's own documentation: host `smtp.resend.com`, port `465` (implicit TLS) or `587` (STARTTLS), username `resend`, password is the Resend API key. Resend lists a **verified domain** as a prerequisite, and the free tier allows 100 emails per day within 3,000 per month — enough to rehearse, not to load test. Keep the Site URL and the `/account/subscription` and `/reset-password` redirect URLs allowlisted, because the confirmation link uses them. In demo mode nothing is sent and the reset screen shows the fixed code `000000`.
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
