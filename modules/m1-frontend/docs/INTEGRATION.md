# Module integration notes

These are implemented **draft** frontend contracts. They require review by the owning modules; no team acceptance is implied.

## Module 2 signup

Default target: `/signup/`, an honest boundary/preview page. Set `NEXT_PUBLIC_SIGNUP_PATH=/your/signup/` before building only when that same-origin route exists in the shared application. External URLs, protocol-relative URLs and query parameters are rejected. Add that route to the same Next.js app when integrating.

Immediately before navigating, M1 validates completion and writes `scamshield.m1.handoff.v1` to localStorage:

```json
{
  "version": 1,
  "source": "module-01",
  "onboardingCompleted": true,
  "interest": "messages",
  "referral": "demo7",
  "createdAt": 1792972800000,
  "expiresAt": 1792974600000
}
```

Allowed interest values: `messages`, `passwords`, `both`. Referral is null or 3–32 ASCII letters, numbers, underscores or hyphens. The full answers and familiarity level are excluded. No preferences appear in URLs. This transport requires the same browser and origin. It is not a cross-origin or cross-device solution.

M2 must parse defensively, check all fields, enum values, creation time and expiry (30 minutes), reject stale/malformed records, and remove context after consumption. Client storage is untrusted and must not grant identity, authorization, subscriptions or a safety score. A production server exchange and schema review remain team work. A localStorage write failure keeps the visitor on benefits and explains how to retry.

## Module 5 events

Disabled by default. After review, set `NEXT_PUBLIC_ANALYTICS_ENABLED=true` and rebuild. Subscribe to the DOM event `scamshield:m1:event` in an M5 client adapter, for example:

```ts
window.addEventListener('scamshield:m1:event', (event) => {
  const detail = (event as CustomEvent).detail;
  // Validate the allowlisted schema, consent and destination before forwarding.
});
```

The shape is `{ version: 1, name, timestamp, context }`. Event names: `landing_view`, `cta_click`, `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`, `signup_handoff_clicked`, `referral_link_copied`, `referral_visit`, `experiment_exposure`.

Context only allows step 1–3, variant A/B, CTA placement header/hero/footer and a boolean referral indicator. It never includes answer values, referral codes, raw URLs, passwords or messages. The adapter does not queue or transmit events. A failed listener must not control onboarding. M5 must agree consent, deduplication, eligible visitors, retention and transport; navigation events can repeat on revisit.

## A/B hook

Disabled by default so the supplied UI copy remains stable. Enable `NEXT_PUBLIC_AB_ENABLED=true` before building. Variant A uses “Find my starting point”; B uses “Discover my starting point” on the landing hero only. Other CTAs are unchanged. Assignment uses cryptographic random bytes and is kept for seven days in the same browser; blocked storage falls back to A. Corrupt/expired assignments are replaced. No conversion uplift is claimed. Suggested evaluation outcome: completed introductions / hero CTA clicks per variant; M5 must approve attribution and analysis before use.

## Persistence and referrals

Progress: `scamshield.m1.progress.v1`, with schema version, enum answers, step, completed state, update and expiry timestamps. Expiry is seven days after the last saved change, checked on app load. Incompatible/corrupt data needs an explicit restart. Blocked writes retain state in memory and show retry; there is no claim that refresh recovery succeeds when saving failed.

Incoming `?ref=demo7` is syntactically validated and stored for seven days. It does not verify a server-owned campaign or count referrals on a server. Outgoing codes are random local demo identifiers. Share links contain only `ref`, never questionnaire answers. Set `NEXT_PUBLIC_SITE_URL=https://your-host.example` for a deployed origin. Localhost links cannot invite people on other devices. Clipboard and Web Share depend on browser support and secure-context rules; manual copy remains available.

The privacy page clears all five Module 01 storage keys. Re-entering an incoming referral URL can attribute that code again. No database migration or Supabase credential is needed for this frontend.

## Adopt into a shared application

Copy the route/component/lib files and merge styling deliberately. Put `JourneyProvider` around the shared routes, avoid duplicating an existing root layout, and retain the team's agreed versions if upgrading is outside scope. Replace the signup preview only when M2 is available. Keep AI/API keys server-side in the owning modules; M1 needs none.
