# Module 3 frontend verification

Verified on 27 October 2026 using Node 24, pnpm 11.25.0, Next.js 16.4.3 and Microsoft Edge on Windows.

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | Passed |
| ESLint | Passed, no warnings |
| Vault model tests | 6 passed |
| Playwright browser suite | 9 passed |
| Production build (`next build --webpack`) | Passed |
| Git whitespace check | Passed |

Browser coverage includes search/pagination, login validation and CRUD, folder rename/delete and bulk movement, masked notes and note CRUD, generator handoff without browser-storage or URL disclosure, manual and idle lock, accepted and denied clipboard access, mobile overflow checks, all route families, and dark theme tokens. Desktop, mobile and dark screenshots were inspected locally. These checks exercise a frontend demo, not server authentication or encrypted persistence.

The login validation test exposed changing accessible names when error messages appeared. Inputs now keep stable names while associating errors through `aria-describedby`; the full browser suite passed after the correction.

## Local environment notes

The original C: drive ran low on space. Validation ran from a source copy at `D:/ScamShield-M3-Build/validation`, with dependencies on D:. A C:-to-D: dependency junction caused Webpack entry resolution errors, so the working source and dependencies were placed on the same drive for validation. Use a normal same-drive checkout and install on other computers.

Slow registry downloads required locally cached official package archives. The committed lockfile uses normal registry resolutions and contains no machine-specific archive overrides. Lint used `NODE_PATH` only to compensate for the temporary local archive installation; this is not a committed application requirement. The optional `unrs-resolver` fallback install script is explicitly disabled; the supplied platform binary worked during lint validation.

Both development and production scripts select Webpack to match the verified build. Browser tests require a running local server at port 3000 and Microsoft Edge. Run `pnpm test:browser` after starting `pnpm dev` in another terminal.

## Remaining integration work

Connect verified account/session checks, ownership enforcement and Supabase RLS, reviewed encryption and key management, durable storage, production strength/common-password checks, and the agreed safety-score contract. Until then, use fictional details only; refreshing or locking discards demo changes.
