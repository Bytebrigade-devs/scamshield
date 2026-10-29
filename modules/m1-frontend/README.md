# Module 1: landing, onboarding and growth

This folder contains Suraji's runnable Module 1 frontend. It is kept separate from the existing root `src/lib/scam-checker` library so this contribution does not overwrite another module's work.

## Run locally

Install Node.js 22.18 or newer, then run these commands from `modules/m1-frontend`:

```text
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The first dependency installation needs internet. No API key, database or account is needed for this standalone frontend.

## Validate and build

```text
npm test
npm run typecheck
npm run build
node scripts/check-export.mjs
npm run preview
```

The build generates `out/` and `OPEN-PREVIEW.html`. Both are intentionally ignored by Git. The HTML preview can be opened directly after building; it includes the team font and uses a small hash-router adapter. The static Next.js build uses normal App Router navigation through the local preview server. Build output and installed dependencies are not source files and are not committed.

## Included scope

Responsive landing content, acquisition buttons, three-question onboarding, answer validation, Back navigation, browser-local refresh recovery, restart and malformed-data recovery, save-failure feedback, personalised benefits, optional sharing/referrals, privacy/storage information and an honest Module 2 signup boundary.

The optional Module 5 browser-event adapter and A/B CTA hook are disabled by default. Candidate contracts and configuration are documented in `docs/INTEGRATION.md`. Account creation, AI checking, password storage, payments and score calculation remain outside M1. This contribution does not merge or publish another module or create a live service.

## Shared styling

The root `docs/THEME-AND-TYPOGRAPHY.md` controls the palette, font and controls. `src/app/theme.css` supplies its light semantic tokens centrally. Plus Jakarta Sans is self-hosted, with the SIL Open Font License retained under `public/fonts/`. Components reuse the shared aliases, 12px controls, 16px cards and visible focus states. Light is the default; no dark-mode switcher or dark-rendering acceptance is claimed.

## Files

- `src/app`: routes and shared theme/styles.
- `src/components`: reusable controls, journey state and screens.
- `src/lib`: questionnaire model, validation and optional events.
- `tests`: model, privacy and event-failure checks.
- `scripts`: static server, export check and offline-preview generation.
- `docs`: requirement map, integration boundaries and validation record.

The frontend is adapted from the supplied Module 1 report and UI PDF. See the validation record for automated checks and browser verification limits.
