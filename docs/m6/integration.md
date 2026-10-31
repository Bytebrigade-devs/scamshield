# Module 06 integration guide

This frontend runs inside the shared Next.js app under `/safety-score`. The default build uses synthetic data and makes no API requests. The connected view contract below is a **draft presentation adapter**, not an approved producer schema or a scoring algorithm.

## Configure a read-only summary endpoint

Use `docs/m6/env.example` as the reference for the shared root `.env.local`, set `NEXT_PUBLIC_M6_API_PATH=/api/safety-summary/`, implement that route in the shared application and rebuild. Only same-origin `/api/` paths without query parameters are accepted. The shared application owns routing and deployment; no standalone HTML build is added by this branch.

The adapter requests JSON using GET, same-origin credentials and no-store caching. The request supplies no user ID or client total. A ten-second cancellation deadline applies. HTTP 401 displays sign-in required; 403 displays access unavailable; other failures or malformed responses display an error and no score. Refresh removes the previous aggregate from the current view while loading.

The **server** must authenticate through M2, derive the subject from the verified session, enforce record ownership and authorize every source retrieval. Client-side shape checks are not access control. Do not trust browser-provided identity, completion claims or score values. Do not accept this UI’s demo session record as real evidence.

## Draft response envelope

```json
{
  "version": 1,
  "generatedAt": "2026-10-26T06:00:00.000Z",
  "policy": { "status": "pending", "version": null },
  "aggregate": { "value": null, "band": null },
  "sources": [
    {
      "id": "account",
      "state": "current",
      "observedAt": "2026-10-26T05:55:00.000Z",
      "freshUntil": "2026-10-26T06:10:00.000Z",
      "version": "m2-view-draft-v1",
      "scoringEligible": false,
      "metrics": { "emailConfirmed": true },
      "limitations": ["Illustrative exporter contract; review pending."]
    },
    {
      "id": "passwords",
      "state": "missing",
      "observedAt": null,
      "freshUntil": null,
      "version": "m3-view-draft-v1",
      "scoringEligible": false,
      "metrics": {},
      "limitations": ["No current summary is available."]
    },
    {
      "id": "scams",
      "state": "missing",
      "observedAt": null,
      "freshUntil": null,
      "version": "m4-view-draft-v1",
      "scoringEligible": false,
      "metrics": {},
      "limitations": ["Processing volume alone is not protective evidence."]
    }
  ]
}
```

Exactly three unique source IDs are required: account, passwords and scams. Accepted states: current, missing, stale and error. Unknown root/source fields and metric names are rejected. Rendered strings are plain React text, never HTML.

Allowed display metrics:

| Source | Metric keys | Types |
|---|---|---|
| account | emailConfirmed | boolean |
| passwords | totalEntries, weakCount, reusedCount, commonCount | nonnegative safe integers |
| scams | checksCompleted, latestAttemptComplete | nonnegative safe integer, boolean |

Counts may overlap; this UI does not sum health flags into a derived score. Do not forward raw passwords, usernames, vault records, notes, tokens, recovery URLs, payment data, private messages or AI submissions. `limitations` contains up to ten plain-text explanation strings, not raw user content.

The server supplies `freshUntil` using agreed source rules. The frontend checks timestamps against the current clock every minute. Expired current summaries become stale, missing dates become unavailable, and invalid/future observations are unusable. Demo fixture deadlines are examples only, not an approved policy.

## Aggregate display rules

No production formula exists in this package. A server-provided value can be displayed only when:

1. The envelope is valid and not future-dated.
2. All three required sources are current.
3. The policy is explicitly approved and has a version.
4. Every source is marked scoring-eligible by the reviewed service.
5. A finite server value from 0 to 100 exists.

Otherwise both total and band are suppressed. The frontend never averages components, redistributes missing weights, rewards payment or adds points for check volume. The default fixtures always have policy pending and sources not scoring-eligible. The earlier checklist’s 65/90 values remain in a separate labelled demo view.

These display conditions do not approve the model. The service owners must agree meaning, weights, uncertainty, bands, normalisation, retention and authority, validate source subjects, and test server calculation against approved fixtures. Do not return arbitrary `approved` flags to make the sample UI show a number.

## History and corrective actions

The sample history belongs only to `checklist-demo-v1`. Integrated history is explicitly unconnected; agree a separate authorized timestamped history contract before implementing it. Keep rule versions per snapshot and distinguish previous snapshots from the current result. The CSV download exports synthetic rows only.

Buttons for account settings, vault health and the scam checker are disabled because those routes are not included. Connect only existing module routes and preserve their server authorization checks. Billing and plan changes must never count as score improvements.

## Local checklist storage

Key: `scamshield.m6.checklist-demo.v1` in sessionStorage.

```json
{"version":1,"checked":["unique","long","manager","replace","private"],"savedAt":"2026-10-26T06:00:00.000Z"}
```

A commit writes first, then updates the saved UI. Failed writes retain choices and do not show a successful save. The explicit unsaved-preview option shows a not-saved result. Repeated saves keep the demo at 90. Reset clears this module’s demo key; it does not alter any real account, vault or M1 storage. Same-tab refresh restores a valid record where browser storage is available. Corrupt records generate a warning and can be reset.

## Shared-app integration status

The branch already mounts `SafetyProvider` in `src/app/safety-score/layout.tsx` and places the feature under `src/features/safety-score`. Navigation is prefixed with `/safety-score`; the existing home redirect and vault remain unchanged. The application root owns font loading and semantic palette values. Module styles are scoped under `.m6-app` and consume those aliases. No package manifest or lockfile is changed.

The API schema and authorization/scoring service remain draft integration work. Keep secrets server-side; this frontend requires none. Complete producer review, subject isolation, approved scoring fixtures and browser acceptance before describing the data integration as production ready.
