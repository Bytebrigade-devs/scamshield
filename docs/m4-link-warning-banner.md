# M4 — link-warning banner view model (M4-12), 17 November 2026

**Status:** pure view-model slice. **No rendering, no network, no link fetching, no AI call.** The owner chose a warning banner above the result on 17 Nov 2026; this module fixes the logic and copy contract. The actual banner HTML/CSS/placement waits on the shared app branch.

## What this adds

`src/lib/scam-checker/ui/link-warning.ts` (+ `link-warning.test.ts`, 9 tests): `buildLinkWarningBanner()`.

| Rule | Behaviour |
|---|---|
| Trigger | only `possible-lookalike` link findings; `official-match`, `unconfirmed`, `not-inspectable` alone produce no banner |
| Hostnames | at most 3, trimmed, capped at 80 chars with `…`, deduplicated case-insensitively; extras reported (“N more flagged link(s) not shown”) |
| Truncation | a truncated inspection adds an explicit “may be more” limitation |
| Copy | draft wording: “Check this link before you tap”; the checker never opens links; verify via the official app/address |
| Safety | never claims the message/sender is safe or verified; an empty inspection never implies safety |

## Verification

- `node src/lib/scam-checker/ui/link-warning.test.ts` → **9/9 pass**
- repository library suite → **228/228 pass** (14 files)
- CI: ubuntu + windows

## Limits

- Copy is **draft**, self-reviewed (TC-8 owner self-review, recorded as non-independent); final language sign-off is separate.
- No URL is opened, fetched, resolved or reputation-checked — the banner is shape evidence only.
- Rendering is intentionally not included: no HTML/CSS/UI change in this slice.
- Dependency-free and offline (no imports, no env, no clock).
