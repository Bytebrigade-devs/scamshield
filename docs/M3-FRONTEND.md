# Module 3 password vault frontend

Implementation for `feat/m3-password-vault`, based on ScamShield-Module-3-All-Frames.pdf (30 frames), the M3 sections of the interim report, and the supplied theme v1.2. No reference PDF is committed to the repository.

## Run

Node 22.13+ and pnpm 11.25.0. Run `pnpm install`, then `pnpm dev`. Open `http://127.0.0.1:3000/vault`. No keys or database setup required.

## Frame coverage

| PDF frame | Route / interaction |
|---|---|
| 01 All items | `/vault`: actual sample counts, search, folder/health filters, sort, pagination, selection |
| 02 Login details | `/vault/login/google` (or another entry ID) |
| 03 Add login | `/vault/new` |
| 04 Password generator | `/vault/generator`, Generate password |
| 05 Password health | `/vault/health` |
| 06 Secure notes | `/vault/notes`, masked by default |
| 07 Folders / bulk actions | `/vault/folders`; select rows to reveal action bar |
| 08 Activity history | `/vault/activity`; category and period filters |
| 09 Locked vault | Lock vault action, `/vault/locked` |
| 10 Edit login | `/vault/login/google/edit` |
| 11 Password revealed | Show password in login details |
| 12 Generated password in form | Generate password in form, or generator's Use in login |
| 13 Mobile vault | `/vault` at a narrow viewport; list cards and bottom navigation |
| 14 Mobile details | Login details at a narrow viewport |
| 15 Mobile add login | Add form at a narrow viewport |
| 16 Mobile health | Health page at a narrow viewport |
| 17 Empty/loading/error/validation | `/vault/states`; real empty search and form validation also implemented |
| 18 Secure note revealed | Reveal note in `/vault/notes` |
| 19 Delete login | Delete login in details |
| 20 Delete selected | Select rows, Delete selected |
| 21 Create folder | New folder in `/vault/folders` |
| 22 Move items | Select rows, Move to folder; also available in details |
| 23 Manage folder | Rename / delete under a folder tile |
| 24 Delete folder | Manage folder, Delete folder; contents move to Unfiled |
| 25 Edit note | Edit note action |
| 26 Delete note | Delete note action |
| 27 Password copied | Successful password copy displays acknowledgement |
| 28 Generated password copied | Successful generator copy displays acknowledgement |
| 29 Login saved | Successful add/edit displays acknowledgement then opens details |
| 30 New secure note | New note action |

Routes in the other modules are not created here. Overview and scam-checker navigation explain their pending integration rather than sending visitors to nonexistent pages.

## Structure

- `src/app/globals.css`: shared semantic light/dark tokens and central font.
- `src/app/vault/vault.css`: responsive component styles, using the tokens. Tailwind utilities handle composition and spacing.
- `src/app/vault/layout.tsx`: persistent in-memory provider and shell.
- `src/app/vault/[[...segments]]/page.tsx`: vault route family.
- `src/features/vault/model.ts`: typed records, generator and preview health helpers.
- `provider.tsx`: demo mutations, content-free activity and clipboard handling.
- `login-list.tsx`, `login-form.tsx`, `screens.tsx`: login workflows.
- `password-tools.tsx`: generator and health.
- `supporting-screens.tsx`: notes, folders, activity and state previews.
- `dialogs.tsx`, `ui.tsx`: shared dialogs and primitives.

## Theme and accessibility

Light is default. Shared dark tokens are implemented at `[data-theme="dark"]` on the root for review, with no invented preference persistence or automatic system selection. Typography uses the locally bundled variable font; its OFL licence is in `public/fonts/OFL.txt`. Controls use 12px radii, cards 16px, visible keyboard focus, 44px primary touch targets and reduced-motion handling. Native modal dialogs trap focus, support Escape and restore focus. Inputs have visible labels and inline validation.

## Intentional differences from static copy

- Sample score 82/100 is visibly labelled illustrative, not a calculation or probability.
- Frontend success messages say session-only storage; they do not claim encryption has been implemented.
- Locking clears the demo dataset and generated draft; continuing restores fictional samples. No fake account-password verification is used. This is a UI lock, not an authentication boundary.
- Clipboard cleanup is best effort. After 30 seconds, the code attempts to read and clear only the unchanged copied value; permission failure is handled without a false guarantee. Locking/unmounting cancels pending cleanup.
- Website values are displayed as text; arbitrary protocols are rejected by forms. External destinations are not automatically opened.
- Activity contains action labels/timestamps only, never passwords, note content or generated values.
- Production backend failure states are visual previews in `/vault/states`; no network or persistence operation is faked as a tested backend.

## Backend handoff

Replace demo provider operations with a reviewed service interface. Authenticate and authorise on the server before each read, mutation, reveal or decryption. Derive ownership from the verified session and enforce RLS. Apply the report's reviewed encryption/key lifecycle before storing real secrets. Do not persist this demo's plaintext state in browser storage, databases, logs or analytics.

The generator uses Web Crypto with rejection sampling and a shuffle; selected character categories are guaranteed. Preview health is deliberately a simple local heuristic and small sample list. It is not the planned full common list, breach checking, an approved strength estimator or a meaningful M6 score. Production summaries need approved overlapping-count definitions, freshness, ownership and formula contracts. No OpenAI calls belong in the vault.

Folder deletion preserves logins and notes by moving them to Unfiled. Selected bulk actions require confirmation. Values generated for the add form travel only in React state, not URLs or browser storage. Current demo data lasts only for the tab's mounted app session; refresh resets it.

## Validation

Meaningful model tests cover generator constraints, exact reuse semantics, lossless folder deletion, URL protocol rejection and absence of secret content in activity fixtures. Browser tests cover login CRUD/validation, folder/bulk workflows, notes/reveal, generator handoff, lock, mobile overflow and route families. See [the verification record](M3-VERIFICATION.md) for observed results and local setup notes.
