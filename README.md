# ScamShield

Digital safety platform combining a **password vault**, an **AI-powered scam checker** (OpenAI), and a **Digital Safety Score** — with a marketing funnel, mocked subscription paywall, and admin back office.

IS2901 Software Development Project · Group **Byte Brigade** · University of Moratuwa, FIT · 2026–2027

> ⚠ All payment handling is **mocked**. No real payment gateway or card data, ever.

## Tech Stack

- Next.js (React) — frontend + backend (API routes keep the OpenAI key server-side)
- Supabase (PostgreSQL + Auth)
- Tailwind CSS
- OpenAI API (only external dependency)
- Recharts (admin analytics)

## Modules

| # | Module | Owner |
|---|--------|-------|
| 1 | Landing Page, Onboarding & Growth | Suraji (@SurajiSaundarya) |
| 2 | Signup, Paywall & Subscription | Lahiru Achintha (@lahiruachintha23-bit) |
| 3 | Password Vault | Prashni (@Prasnida) |
| 4 | AI Scam Checker | Svishwa (@Svishwa2004) |
| 5 | Admin Dashboard, Analytics & Operations | Vishmi (@Vish-Himaya) |
| 6 | Digital Safety Score | shared across modules — coordinator: Suraji (@SurajiSaundarya) |

*All five module owners assigned by 18 Oct 2026; the Module 6 coordinator and each member's score slice were confirmed the same day, and the coordinator was reassigned to Suraji (@SurajiSaundarya) on 25 Oct 2026. The second hats are confirmed at the ownership meeting.*

## Workflow Rules (all members)

- `main` is protected — never push directly; work on feature branches (`feat/m3-vault-crud`)
- Every change reaches `main` through a Pull Request. **@Svishwa2004 reviews and merges** — no teammate approval is required, and the merge button is disabled for everyone else
- Commit small and often **from your own GitHub account** — commit history is your individual-contribution evidence at code review and viva
- Shared schema changes: update the schema doc and flag affected module owners in the PR description

See [GITHUB-GUIDE.md](GITHUB-GUIDE.md) for the full beginner walkthrough.

## Theme & Typography (all members)

Every module's UI must follow the shared team spec: see [docs/THEME-AND-TYPOGRAPHY.md](docs/THEME-AND-TYPOGRAPHY.md) — colours, fonts, buttons and surfaces are defined there; don't invent module-local styling.

## Run the Module 3 frontend

Use the validated Node.js 24.19.0 version pinned in `.nvmrc` and pnpm 11.25.0. The package engine declares a minimum of Node 22.13.0; it is not a claim that every allowed version was tested.

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000/vault. The home route redirects to the vault. No environment variables or external service credentials are needed for this frontend preview.

The implementation follows all 30 supplied vault frames using Next.js App Router, React, Tailwind CSS v4, semantic theme tokens and a locally hosted Plus Jakarta Sans font. Logins, notes, folders, generator, health, activity, lock, mobile layouts and dialogs are interactive. See [the M3 frontend guide](docs/M3-FRONTEND.md) for the frame-to-route map and integration boundaries.

This branch uses synthetic, in-memory records. Refreshing or locking resets demo changes. Supabase authentication, encrypted persistence, entitlement enforcement, production health estimation and the safety score formula remain backend integration work. Do not enter real credentials.

```bash
pnpm typecheck
pnpm lint
pnpm test:vault
pnpm build
# With Microsoft Edge installed; Playwright starts its own local server:
pnpm test:browser
```

The existing M4 source and tests are retained. The new app scaffold is Next.js 16; align the framework baseline with the M2 branch before merging shared infrastructure into main. Development and build scripts use Webpack. See [verification results and local setup notes](docs/M3-VERIFICATION.md).
