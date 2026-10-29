# Module 6 verification — 29 October 2026

Environment: Windows, Node.js 24.18.0, Next.js 16.4.3, React 19.3.1, Tailwind CSS 4.3.3, TypeScript 5.9.3. The repository's Node/package-manager declarations and lockfile are unchanged.

| Check | Result |
|---|---|
| Module 6 model and mocked-service tests | 16 passed |
| Existing vault model regression tests | 6 passed |
| ESLint across the shared repository | Passed |
| TypeScript restricted to new M6 feature/routes/tests | Passed |
| Shared-project TypeScript | Blocked by three pre-existing M4 errors |
| Production Webpack compilation | Passed |
| Full production build | Stops at the same pre-existing M4 TypeScript errors |
| Browser interaction / visual / screen-reader QA | Not completed in this environment |

## Existing shared build blocker

`src/lib/scam-checker/check-boundary.ts`, lines 404, 435 and 441, reports TS18047: `snapshot` is possibly null. A separate TypeScript run containing **only files already tracked on the main baseline**, excluding every new M6 file, reproduced exactly these three errors. No Module 4 file is changed in this contribution. The root production build compiles successfully before stopping at that same TypeScript stage; it is not reported as a successful full build.

The scoped M6 check includes its feature files, route files and two tests against the root compiler settings. It does not disable errors in committed configuration. Temporary validation configurations are kept outside the repository and are not committed.

## Dependency setup in this execution environment

pnpm 11.25.0 could not register the project because Windows denied its store-registration symbolic link. For local validation only, the declared top-level dependencies were installed with npm using their versions from the committed pnpm lockfile, with install scripts and package-lock generation disabled. The root package manifest, pnpm workspace configuration and pnpm lockfile are unchanged. This records a tooling limitation; it does not claim a completed frozen pnpm installation or an identical transitive installation.

## What the tests establish

Required practices; exact illustrative score transitions and band boundaries; safe restoration of fixed practice IDs; malformed/future-dated records; write-before-save-success behaviour; strict source schema and private/unknown field rejection; stale/missing evidence handling; suppression of totals for unapproved policies or ineligible sources; display rather than recalculation of eligible test totals; no reward for additional checks; restricted same-origin API paths; chronological history; and mocked API authorization/network/format failures.

The approved-policy response in tests is an isolated test fixture, not a real team-approved scoring model. The default preview never displays that fixture as real data.

## Remaining manual acceptance

- Complete checklist validation, back/review/cancel, save, refresh restoration, failure/retry, explicit unsaved preview and reset in a browser.
- Confirm Overview, History and Guide highlight correctly and every M6 transition remains within `/safety-score`.
- Exercise all integration preview states and source-detail disclosure; check timestamp freshness and no invented total/band.
- Check chart/table/CSV consistency and seven/30-day filters.
- Check keyboard focus, root skip link, labels, error announcements and screen-reader reading order.
- Review desktop/mobile layouts, 200% zoom, reduced motion and overflow. Inspect the existing vault after visiting M6 to verify CSS isolation in a real browser.
- Validate authentication, per-user access, approved producer contracts, scoring policy and authorized corrective actions with owning modules before any production integration claim.

Browser QA is not substituted by another browser-control method; the earlier local preview and current-URL verification limitations remain. No production, dark-mode or usability acceptance is claimed.
