# Reply to Svishwa on the M2 entitlement contract

Hi Svishwa, thanks for confirming that M4 owns checker history and feedback, scoped to the authenticated Supabase user. M2 supplies identity and entitlement. I’ve recorded the 30/90/180-day retention windows, user deletion, and read-only access to retained history after expiry as M4’s positions. The team still needs to confirm them as shared policy.

- **Trial mapping.** M2 returns `status: "trialing"` and `planId: "sentinel"`. Map that status to M4’s `trial`. A cancelled trial has `status: "cancelled"` and can retain access until expiry. Use a non-null `limits.trialTotalChecks` on an allowed decision to keep the trial cap in that case.
- **Expiry format.** `entitlement.expiresAt` is the ISO timestamp string from `subscription.renews_at`, or `null`. Convert the string to epoch milliseconds with `Date.parse` and reject null, invalid, or elapsed values. At the exact expiry instant, access is denied. An expired row can still have a stored status of `active` or `cancelled`.
- **Subject key.** Use `context.user.id` from the verified result of `getSubscriptionContext(request)`. The nested `entitlement` object carries the plan decision. Account ownership comes from the verified Supabase user.
- **Limits and usage.** Require `entitlement.canRunCheck` before applying M4’s usage and budget rules. M2 supplies allowance limits and does not decrement any check counters. `limits` is `null` when the decision denies access.
- **Trial clock.** The seven-day access window starts at Supabase signup and ends at `expiresAt`. First use can start M4’s usage accounting, but it never moves that expiry or creates a new 15-check allowance. Apply the 15 successful checks across the original trial window and stop when the allowance is exhausted or the trial expires, whichever comes first. The separate paid monthly usage window can start at first use.
- **Reasons.** Entitlement decisions return exactly `valid_entitlement` or `subscription_required`. A missing subscription yields a verified user with a denied decision. The separate helper results `unauthenticated` and `unavailable` map to HTTP 401 and 503 respectively. Treat thrown errors as 503.
- **Environment.** The read helper uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the caller’s bearer token. M2’s write routes separately use `SUPABASE_SERVICE_ROLE_KEY` on the server. Use `NEXT_PUBLIC_M2_MODE=backend` for the shared app’s live M2 UI.

The helper is currently in the local M2 working copy on `feat/m2-signup-paywall`. The team still needs to confirm the shared target branch and CI or a deployed test environment. I’ll flag the helper once it lands on the shared base. The last Supabase check found Auth reachable and `public.subscriptions` missing, so a live entitlement test still needs the schema applied.

## Sample results for adapter tests

Use a fixed clock of `2026-11-15T12:00:00.000Z`. The examples below show the fields M4 needs from the helper. Verified results also include `subscription`, which is a row or `null`, and the full Supabase user object. For a missing subscription, use the `noSubscription` fixture as shown.

```json
{
  "trial": {
    "kind": "verified",
    "user": {"id": "00000000-0000-4000-8000-000000000001"},
    "entitlement": {
      "canRunCheck": true,
      "reason": "valid_entitlement",
      "planId": "sentinel",
      "status": "trialing",
      "expiresAt": "2026-11-21T09:00:00.000Z",
      "limits": {"monthlyChecks": 15, "dailyChecks": 5, "trialTotalChecks": 15, "inputCharacters": 2000, "checksPerMinute": 5}
    }
  },
  "paid": {
    "kind": "verified",
    "user": {"id": "00000000-0000-4000-8000-000000000002"},
    "entitlement": {
      "canRunCheck": true,
      "reason": "valid_entitlement",
      "planId": "guardian",
      "status": "active",
      "expiresAt": "2026-12-01T09:00:00.000Z",
      "limits": {"monthlyChecks": 200, "dailyChecks": 15, "trialTotalChecks": null, "inputCharacters": 2000, "checksPerMinute": 5}
    }
  },
  "expired": {
    "kind": "verified",
    "user": {"id": "00000000-0000-4000-8000-000000000003"},
    "entitlement": {
      "canRunCheck": false,
      "reason": "subscription_required",
      "planId": "guardian",
      "status": "active",
      "expiresAt": "2026-11-15T12:00:00.000Z",
      "limits": null
    }
  },
  "noSubscription": {
    "kind": "verified",
    "user": {"id": "00000000-0000-4000-8000-000000000004"},
    "subscription": null,
    "entitlement": {
      "canRunCheck": false,
      "reason": "subscription_required",
      "planId": null,
      "status": null,
      "expiresAt": null,
      "limits": null
    }
  },
  "unauthenticated": {"kind": "unauthenticated"},
  "unavailable": {"kind": "unavailable"}
}
```
