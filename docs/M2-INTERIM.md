# Module 2 interim handover

**Superseded for the interim UI on 26 October 2026:** the user requested a frontend-only demo with dummy data. Follow `FRONTEND-DEMO.md`; Supabase/email/payment services are not needed for the current visible flows. The implementation notes below describe the retained backend version and earlier milestones.

This module demonstrates registration/login, password recovery, plan comparison, a one-time trial, simulated checkout, subscription display, and cancellation with access until expiry. All billing is mocked. Checkout has test-only card-entry fields; no payment provider or real charges are used, and no credentials are transmitted or saved.

## Run locally

1. Install the project dependencies with `pnpm install` (pnpm 11.25.0 and the Node version in `.nvmrc`; `package.json` requires Node 22.13.0 or newer).
2. Copy `.env.example` to `.env.local` and enter your Supabase project's URL, anon key and **server-only** service role key. Never share or commit the service role key.
3. Ask the team's schema steward to review `docs/m2-schema.sql`, then apply it in the Supabase SQL editor for the agreed development project. It is transactional and rerunnable. It intentionally aborts if old Free/Premium rows exist: agree their migration first; do not delete teammates' records to make it run.
4. In Supabase Auth, enable email/password authentication. Configure the Site URL for the development/deployed site and allow its `/reset-password` redirect URL. With email confirmation enabled, confirm the account before logging in. Recovery emails require working Supabase email delivery.
5. Run `pnpm dev`, then open `http://localhost:3000/pricing`.
6. Run `pnpm test:subscription`, `pnpm typecheck`, and `pnpm build` before your PR.

The service role key is required because authenticated browsers can only **read their own subscription**. Browser insert/update/delete privileges are revoked; trusted routes verify the bearer token with Supabase before writing. This prevents a forged browser request to Supabase from granting a plan or changing expiry. The simulated checkout API intentionally allows registered accounts to create mock entitlements; it is not a production payment integration.

## Implemented scope

| Feature | Implementation |
| --- | --- |
| Signup/login | Supabase email/password; required email; signup password minimum 8 characters; confirmation notice; logout |
| Password recovery | Reset email and password update screens; invalid/unavailable link states |
| Plans | Sentinel / Guardian / Aegis; LKR monthly 490/990/1,990; quarterly 1,320/2,670/5,370; annual 4,900/9,900/19,900 |
| Trial | Seven days anchored at account creation; 15 checks total; Sentinel daily limit; one allocation per registered account |
| Checkout | Monthly/quarterly/annual; Add Your Card form using synthetic test details, followed by payment review; mock success and decline; request validation; failure leaves entitlement unchanged |
| Promo input | Nonempty codes rejected with an explanation; no approved promo values were supplied |
| Account | Plan/status/expiry; trial upgrade; expired-plan repurchase; cancellation confirmation |
| Cancellation | Keeps plan and expiry; cancelled access allowed strictly before expiry; no renewal worker or real recurring billing |
| Access decision | Session verified server-side; unknown/missing/expired/suspended/past-due denies; valid trial/active/cancelled allows subject to M4 controls |

## M4 integration contract

Call `getSubscriptionContext(request)` from `src/lib/subscription-server.ts` on the server for every protected check. Send the Supabase access token in the `Authorization: Bearer <access_token>` header. The helper verifies the token, selects only the verified user's subscription and evaluates it using the server clock. `GET /api/subscription` uses the same helper and returns its subscription and entitlement with `Cache-Control: no-store`.

Handle `unauthenticated` as HTTP 401 and `unavailable` or a thrown error as HTTP 503. For a `verified` result, use `user.id` as the owner ID and require `entitlement.canRunCheck` before proceeding to M4's usage and budget checks. A verified user can have a null subscription and a denied entitlement.

The decision includes `canRunCheck`, `reason`, `planId`, `status`, `expiresAt`, and limits. Limits are 60/200/600 successful checks per month, 5/15/40 per day, 2,000 input characters and 5 checks/minute. Trials have a 15-check total cap, including when cancelled. These values are entitlement metadata, **not a usage counter**.

M4 must atomically enforce monthly/daily/trial/burst limits and provider budgets before calling a model, and count only completed successful checks. No checker endpoint or usage ledger exists in this repository yet. No claim is made that quotas are enforced by this M2 implementation. History authorization/ownership and retention remain separate, unimplemented decisions. Proposed 30/90/180-day history windows are not advertised as implemented retention.

The database field `renews_at` is retained for compatibility but means **entitlement expiry** here. No automatic renewal occurs. Expiry comparisons use the server clock; the account screen displays Sri Lanka time. `past_due` and `suspended` cannot be cleared through mock checkout. Valid paid-plan changes/reactivation and invoices remain later work.

The M2 implementation is on `feat/m2-sync-main`, synced with `main` at `fa19c3d` and submitted as PR #46 against `main`. Shared app CI runs on every PR; a deployed test environment is still unconfirmed. Proposed ownership for M4 review is that M4 owns checker history and feedback records and scopes them by the authenticated Supabase `user.id`. M2 provides the server-side identity and entitlement contract.

## Manual demo and integration checklist

### Card-method selection (26 October 2026)

The user's screenshot correction replaces card-type selection with a rounded Add Your Card form. It accepts a demo name, number `4242 4242 4242 4242`, future MM/YY expiry and security code `123`. Values stay in component memory and are cleared on Add Card; only a fixed demo-card label remains for checkout review. No field values are sent to the subscription API or browser storage. Save my card is visibly disabled. The API retains optional `paymentMethod` validation for older demo clients; omitted methods default to debit card, with no database persistence. There is no physical POS or live gateway. Connecting a real provider requires merchant configuration and server-verified payment results before granting access.

- Create a synthetic test account; confirm the email; log in and log out.
- Request a password reset, follow the email link and set a new password; verify login.
- Start a trial; refresh account; attempt a second allocation and verify rejection.
- With an account with no paid entitlement, choose each plan/cycle; choose declined and verify no row changes; choose success and verify plan/expiry after refresh.
- Cancel; verify the same expiry and allowed access before expiry. In the development database, use steward-controlled fixtures with expired/cancelled/suspended states; verify denial at expiry and for suspended/past-due.
- Using two test accounts, verify each can read only their own subscription; direct insert/update/delete using an anon/authenticated client must fail.
- Leave Supabase unconfigured or disconnect the network; verify explanatory errors and retry controls, without a stuck loading state.
- Test mobile, keyboard focus, input labels and loading states. Capture actual screenshots for report evidence.

## Evidence and limitations

Automated policy and route tests are included. Record actual test/build output in the PR. Live Supabase/email/RLS tests require the configured shared development project and are not implied by passing local tests. Do not mark the manual checklist complete without running it.

This branch was rebuilt from the M2 work and merged with `main` (`fa19c3d`) on 20 November 2026, including the Next.js 16.4.6, React 19 and Tailwind CSS 4 baseline. Commit changes from the module owner's own account and submit a PR for @Svishwa2004 to review. Flag the M3/M4/M5 owners and schema steward because plan IDs, cycles and write permissions changed.

See `M2-DESIGN.md` for user stories, diagrams and interim scope. These documents provide module material; they do not constitute the whole team's report, presentation or approved Figma designs.
