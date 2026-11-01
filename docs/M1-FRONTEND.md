# Module 1 frontend

Module 1 is integrated into the shared Next.js application, using its single root package manifest, pnpm lockfile, Tailwind import, semantic theme tokens and licensed Plus Jakarta Sans font. It contains no standalone app, npm lockfile, static-export config, duplicate font or Windows-only launcher.

## Run on Windows, macOS or Linux

Use Node.js 24.22.1 (the `.nvmrc` target) and pnpm 11.25.0 from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

On macOS/Linux with nvm installed, `nvm install` and `nvm use` select `.nvmrc`. On Windows, install/select Node 24.22.1 using your normal Node installation or version manager. The pnpm commands above are the same in PowerShell, Command Prompt and POSIX shells; no `.cmd` launcher is needed.

| Route | Purpose |
| --- | --- |
| `/` | Landing, explained benefits, process, FAQ and acquisition CTAs |
| `/onboarding` | Three-question introduction, Back, validation, saved progress and restart |
| `/benefits` | Preference-based feature introduction; no safety score |
| `/share` | Optional referral link, clipboard/manual copy and Web Share |
| `/privacy` | Retention disclosure and clearing all five M1 storage keys |
| `/signup-preview` | Explicit M2 boundary; no account creation or payment |
| `/vault` | Existing M3 frontend, retained |

The `(marketing)` route group adds no URL prefix. Its nested layout mounts `JourneyProvider` only for M1. Styles are scoped to `.m1-app`, and the existing root skip link targets each screen's `main` landmark. Browser storage is restored after hydration with cancellation on unmount. M1 does not mount providers or apply styles to the vault.

The home route now shows the landing page. M3's direct `/vault` routes and instructions are retained. `/signup-preview` deliberately leaves `/signup` available for M2; switch the public signup-path setting only after that route and the X-02 contract are agreed. Events and experiments remain disabled by default; no event delivery is implemented. No Supabase, AI or payment credentials are needed.

```sh
pnpm test:m1
pnpm typecheck
pnpm lint
pnpm build
```

See [requirements mapping](m1/requirements.md), [draft integration contracts](m1/integration.md), [optional public settings](m1/env.example) and [verification](m1/verification.md).
