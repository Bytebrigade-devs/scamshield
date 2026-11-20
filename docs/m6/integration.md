# Module 6 integration and producer mapping

Updated 20 November 2026. M6 runs in the shared app at `/safety-score`. Default data is synthetic and makes no requests. This presentation envelope assembles producer summaries; it does not supersede their draft contracts or sign off M6-09.

## Recorded inputs retained

**M3:** the supplied interim report Appendix C.2 defines `version`, `generatedAt`, `totalLoginCount`, `assessedLoginCount`, `weakPasswordCount`, `reusedPasswordEntryCount`, `commonPasswordMatchCount`. The view uses those five count names unchanged in `metrics`. Map producer `generatedAt` to source `observedAt` and producer version to the source contract version (the fixture label is `m3-view-draft-v1`). Server assembly supplies `freshUntil`; the fixture deadline is not an approved freshness rule. All five counts are required when present, nonnegative safe integers and no larger than the LOGIN total. Empty/missing data never means healthy. Counts can overlap; reused count means entries in exact duplicate groups, not groups. No normalization or score is derived from them. Only LOGIN entries count; secure notes are excluded.

**M4:** source `evidence` retains the exact seven-field `m4.scam_activity_evidence` draft from `src/lib/scam-checker/boundary/activity-evidence.ts`: `contract_version`, `summary_type`, `subject_ref`, `as_of`, `availability`, `latest_attempt`, `limitations`. M6 reuses the producer's validator rather than defining a third activity schema. `latest_attempt` is the existing three-field object or null. Controlled limitation IDs are kept; the UI renders readable labels. No check-count metric, verdict, confidence, raw message, contact, action-completion claim or numeric contribution is invented.

Example M4 payload nested under the scams source (synthetic subject only):

```json
{
  "contract_version": "0.1.0-draft",
  "summary_type": "m4.scam_activity_evidence",
  "subject_ref": "synthetic-subject-01",
  "as_of": "2026-11-20T06:00:00Z",
  "availability": "available",
  "latest_attempt": {
    "occurred_at": "2026-11-20T06:00:00Z",
    "analysis_status": "limited",
    "analysis_mode": "rules_only"
  },
  "limitations": ["self_selected_checks", "classification_not_verified_incident", "no_protective_action_verified"]
}
```

Map `as_of` to `observedAt`; `available` to current only while the separately supplied freshness deadline is valid; `stale` to stale; `unavailable` to missing/error as appropriate. A current source requires available evidence. A missing source can carry `evidence: null`. Its `metrics` is always empty. `subject_ref` is validated but never displayed or copied to demo storage/CSV; the server must bind it to the authenticated subject. Shape validation cannot prove ownership. M4 processing evidence remains non-scoring in all default fixtures. More checks do not establish improved safety.

**M2:** `emailConfirmed` remains an explicitly unapproved presentation placeholder, not a new account-security producer contract. No account exporter is connected.

## Optional read-only presentation endpoint

`NEXT_PUBLIC_M6_API_PATH=/api/safety-summary/` accepts only a same-origin `/api/` path without a query. GET uses same-origin credentials, no-store caching and a ten-second abort deadline. The browser supplies no identity, counts or score. 401 requests sign-in, 403 reports access unavailable, malformed/network failures suppress results. Refresh clears the prior aggregate while loading.

The existing root envelope is `{version: 1, generatedAt, policy: {status, version}, aggregate: {value, band}, sources}`. Exactly three unique source IDs are required: account, passwords, scams. Each source has `id`, `state`, `observedAt`, `freshUntil`, `version`, `scoringEligible`, `metrics`, `limitations`; scams additionally requires `evidence`. Unknown root/source/metric keys are rejected. Source explanation strings are rendered as plain text. The new fields are a draft assembly boundary only; no backend route is implemented by M6.

The server authenticates through M2, derives the user from the session, authorizes each retrieval and enforces ownership/RLS. It must never return vault records, passwords, usernames, notes, keys, payment data or submitted messages. Do not accept a demo checklist as protective evidence. No source summary is persisted by this UI.

## Display conditions and pending decisions

The frontend calculates no production score. A supplied result is displayed only for a valid non-future envelope, all three current sources, explicitly approved/versioned policy, all sources scoring-eligible, and a finite server total from 0 to 100. Otherwise total and band are suppressed. Every default fixture has pending policy and non-scoring sources; source age is reevaluated each minute. Future observations and expired/missing dates are unusable.

The 65/90 checklist remains a separately labelled synthetic flow. Payment, check volume and missing inputs never add points. Formula, weights, bands, subject binding, freshness, retention and numeric fixtures still need joint owner review. Alignment with recorded draft fields is not consumer sign-off: Suraji's yes/no on the scam-activity definition, guidance/destinations and compatibility of both design inputs remains owed. Proposed review slot from the team correspondence: 21 November 2026; no approval/session booking is asserted by this code.

## History, actions and local state

Only synthetic `checklist-demo-v1` history is shown/exported; integrated history is unconnected. Account/health/checker destinations require explicit shared integration and normal authorization before enabling. Although `/checker` now exists on main, this PR does not claim the M6 guidance/destination review is complete.

`sessionStorage` key `scamshield.m6.checklist-demo.v1` stores only version 1, the five practice IDs and a saved timestamp. Writes succeed before the UI claims a save. Failures retain choices; unsaved preview says not saved; repeated saves remain at 90. Reset removes only this demo key. No authentication, encryption or production scoring is implied.

M6's route mount and vault access do not depend on the home-page destination or PR #24's merge order. Shared font/theme/package configuration is reused. Only the `test:m6` script and conditional shared-CI test step are added to existing setup.
