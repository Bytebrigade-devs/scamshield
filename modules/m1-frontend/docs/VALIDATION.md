# Validation record

Date: 26 October 2026 (Asia/Colombo)
Environment: Windows, Node.js 24.18.0, npm 11.16.0.

## Automated verification

- `npm test`: **11 tests passed**. Covers saved-state restoration, corrupted/incompatible/expired state, invalid answers and impossible steps, answer editing, completion, minimal expiring signup context, safe referral codes, safe internal signup paths, benefit selection and event payload filtering/failure isolation.
- `npm run build`: production Next.js export and standalone HTML generation. The build includes TypeScript checking. Final exported routes: homepage, onboarding, benefits, sharing, signup handoff and privacy, plus not-found handling.
- `node scripts/check-export.mjs`: checks exported route HTML, local asset/navigation targets and that the HTML preview has no external script/stylesheet dependencies.

The Next.js build uses one worker thread with the webpack build worker disabled to avoid intermittent child-process file-permission errors in this Windows execution environment. This setting is visible in `next.config.ts`.

## Browser verification boundary

Interactive browser testing and visual screenshot review could not be completed in this environment. Local HTTP requests were blocked with EACCES/timeouts, and the browser's security policy rejected file URLs. No alternate browser or policy bypass was attempted. The HTML preview is generated from the same React components, with a small hash-navigation adapter, but has not been visually verified here.

Automated tests verify logic and build output; they do not establish end-to-end browser, accessibility or usability acceptance. No deployed/backend integration is claimed.

## Manual acceptance checklist

Use `START-PREVIEW.cmd` and http://127.0.0.1:3000 for normal-origin testing. Use synthetic preferences only.

- Try each landing CTA. Confirm entry/resume is reached.
- Begin, submit an empty answer and confirm the inline error and announcement.
- Answer question 1, advance, refresh, resume, then edit an earlier answer. Confirm other answers remain.
- Complete questions for both checker-first and vault-first journeys; confirm relevant benefit copy.
- Use Edit my answers after completion, then complete again. Restart and confirm previous answers are cleared.
- Try malformed/expired saved state in a developer test harness. Confirm the recovery screen.
- Simulate unavailable or failing browser storage. Confirm no false saved confirmation, current-tab continuation and retry.
- Select Continue to signup. Confirm the standalone boundary notice and minimal expiring context; confirm no account or payment.
- Try copying, manual-copy fallback and sharing cancellation. Confirm sharing never blocks continuing.
- Open a valid and malformed referral link. Confirm the landing remains usable and no answers appear in links.
- Review Privacy & storage and clear all Module 01 data.
- Navigate using Tab, Shift+Tab, Space, arrow keys and Enter. Check radio grouping, progress labels, visible focus, error announcements and reading order with a screen reader.
- Review at 390px and 1440px widths and 200% zoom. Confirm no clipped content or horizontal scrolling.
- If the team enables analytics/experiments, verify the browser event listener, minimal payload, persistent assignment and approved M5 transport separately.

Module 2/5 connection settings and candidate contracts need the owning team's review. Server referral tracking, AI checking, signup, password storage, payments and safety-score calculation are outside this frontend.


## GitHub source contribution — 29 October 2026

The Module 1 source is added under `modules/m1-frontend` without replacing the existing Module 4 library or team documentation. The repository branch was inspected before addition and contained no Module 1 frontend. Shared light-theme tokens, Plus Jakarta Sans with its font licence, control geometry and focus/disabled states are aligned with the repository styling guide. The offline preview generator embeds that local font. Generated output, dependencies and real environment files are ignored.

The shared application and Module 2/5 contracts still require team integration. Browser testing remains unverified in this execution environment. No deployed service or accepted integration is claimed.

Verification for this source contribution: 11 automated tests passed; the Next.js production build and TypeScript check passed; the export check verified six routes, 111 local asset/navigation references and the self-contained preview including its embedded team font. Build retries were needed after Windows denied initial creation of generated Next.js cache folders. Browser interaction and visual review remain unverified.
