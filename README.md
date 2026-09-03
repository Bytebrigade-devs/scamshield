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
| 1 | Landing Page, Onboarding & Growth | TBD |
| 2 | Signup, Paywall & Subscription | TBD |
| 3 | Password Vault | TBD |
| 4 | AI Scam Checker | TBD |
| 5 | Admin Dashboard, Analytics & Operations | TBD |
| 6 | Digital Safety Score | flexible (own / share / split) |

## Workflow Rules (all members)

- `main` is protected — never push directly; work on feature branches (`feat/m3-vault-crud`)
- Every change reaches `main` through a Pull Request. **@Svishwa2004 reviews and merges** — no teammate approval is required, and the merge button is disabled for everyone else
- Commit small and often **from your own GitHub account** — commit history is your individual-contribution evidence at code review and viva
- Shared schema changes: update the schema doc and flag affected module owners in the PR description

See [GITHUB-GUIDE.md](GITHUB-GUIDE.md) for the full beginner walkthrough.
