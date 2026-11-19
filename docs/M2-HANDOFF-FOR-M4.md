# ScamShield M2 handoff for M4

**To** Svishwa (@Svishwa2004) · **From** Lahiru Achintha, M2 owner  
**Date** 15 November 2026 · **Response to** Ask #2, M2 entitlement, session and shared app

## Session and entitlement

M2 provides Supabase signup and login, password recovery, a one-time trial, plan selection, simulated checkout, and subscription cancellation. For M4's protected checker route, call `getSubscriptionContext(request)` from `src/lib/subscription-server.ts` on the server. Pass the signed-in user's Supabase access token in the `Authorization: Bearer <access_token>` header. The helper verifies the token with Supabase, reads the subscription for that verified user, and evaluates access using the server clock.

| Helper result | How M4 should handle it |
| --- | --- |
| `unauthenticated` | Return HTTP 401 and prompt the caller to sign in. |
| `unavailable` or a thrown error | Return HTTP 503 and stop before invoking the checker or model provider. |
| `verified` | Use `user.id` as the authenticated owner ID. For a new check, require `entitlement.canRunCheck`, then apply M4's usage and budget checks. |

The decision provides `canRunCheck`, `reason`, `planId`, `status`, `expiresAt`, and `limits`. The plan IDs are `sentinel`, `guardian`, and `aegis`. Statuses are `trialing`, `active`, `cancelled`, `past_due`, and `suspended`. A valid trial, active plan, or cancelled plan can grant access before expiry. Missing subscriptions, expired entitlements, suspended accounts, and past-due accounts deny access. The database field `renews_at` holds the entitlement expiry.

| Entitlement | Monthly checks | Daily checks | Trial total |
| --- | ---: | ---: | ---: |
| Sentinel | 60 | 5 | — |
| Guardian | 200 | 15 | — |
| Aegis | 600 | 40 | — |
| Seven-day trial from signup | 15 | 5 | 15 |

The shared limits are 2,000 input characters and 5 checks per minute. M4 owns enforcement of usage limits and provider budgets. `GET /api/subscription` exposes the same decision to the signed-in M2 UI with `Cache-Control: no-store`. M4's server route can call the helper directly.

M4 anchors the monthly allowance at first use. Failed, rejected and AI-unavailable checks leave the quota unchanged. M2 displays the allowance from the entitlement response. Access decisions use the session and subscription fields and require no submitted message text.

## Shared app and test environment

The shared app uses Next.js App Router, TypeScript, and Supabase. The helper and its tests are in the local M2 working copy on `feat/m2-signup-paywall`. Use the contract above to develop the M4 adapter with test doubles. The shared target branch and availability of CI or a deployed test environment still need team confirmation.

The local production build, TypeScript check, and 27 subscription tests passed. The last live check found Supabase Auth reachable and the `public.subscriptions` table missing. Live trial, checkout, cancellation, and row access checks are pending schema setup. Payments are simulated. See `docs/M2-BACKEND.md` for setup.

## History and feedback ownership

My proposal is that M4 own checker history and feedback records and scope access to the verified Supabase `user.id`. M2 supplies identity and entitlement. Please confirm the ownership split before wiring persistence. The team still needs to agree on the retention policy and whether reading prior history requires an active subscription.
