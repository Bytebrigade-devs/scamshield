# M4 team update — 15 November 2026

**From:** M4 (Svishwa) · **Audience:** all module owners + manager · **Status:** M4 code work that can be done alone is finished; the rest waits on shared decisions, M2, and funding.

---

## 1. TL;DR

- **Four M4 PRs are merged to `main`**: the two cross-module docs, the URL-shape code slice, and the offline Sri Lankan phone-shape library. Repository test suite: **166/166**.
- **The team agreed to M4's decision positions** (retention, history-after-expiry, schema direction, X-13 fields, test-harness second hat, wording review) — recorded as **owner-reported**; a one-line reply from each owner would make it citable.
- **Recommended shared setup:** base branch **`main`**, short-lived `feat/<module>-<slug>` branches, one shared CI workflow **`Shared app CI`** running lint + typecheck + build + tests.
- **Still blocked:** shared branch/CI name, M2's helper landing + RLS, schema/steward, M5's field list, reviewer name, and **funding** (≈USD 15 one-time decision stands, **money/key not provided yet** → all live AI work stays parked).
- **Nothing live:** no API key configured, no provider call, no deployment, no Supabase writes.

---

## 2. What M4 finished (all on `main`)

| PR | What landed | Merge commit |
|---|---|---|
| #27 | `docs/m4-cross-module-asks.md` — what M4 needs from each module | `bced907` (earlier) |
| #28 | `docs/m4-what-other-modules-need.md` — what each module takes from M4 | `0e429cd` |
| #29 | URL-shape evidence flags `R-M4-21…23` + link↔brand proximity fix and regression test | `19dc56e` |
| #30 | Offline Sri Lankan **phone-shape** library (metadata, generator, 6 tests, doc) | `a1a2331` |

Also done M4-side (not in the repo): the **M2 entitlement adapter**, built to M2's confirmed contract and tested with M2's own fixtures (12/12 tests; M4 workspace suite 386/386).

## 3. Team agreement — what was agreed (owner-reported)

The owner reported that the team agreed to M4's positions. **No written per-owner replies, names or dates are captured yet** — please send a one-line “agreed” (name + item + date) so the project record can cite it.

| Item | Agreed position |
|---|---|
| Retention | 30 / 90 / 180-day windows by plan = the visible-history window **and** the retention period; delete after; user can delete their history; account deletion removes M4 rows |
| History after a subscription ends | **Read-only** until retention ends; **no new checks** without an active entitlement |
| Shared schema | M4's proposed check / finding / usage-event / history-row fields are the direction (steward + final field names to confirm) |
| X-13 fields | M4's minimal usage event + evidence summary (M5's exact field list to confirm) |
| Test-harness second hat | M4 keeps the shared test-harness/conventions role; convention: plain `node --test`, no extra libraries |
| Wording review | Sinhala/Singlish copy reviewed — independent reviewer name (or owner self-review) still to confirm |

**Still needed from you (one line each):** branch/CI name (M2/team) · schema steward + fields (M3) · exact field list (M5) · reviewer name (team) · retention/history written confirmation (M1/M2).

## 4. Recommended shared branch + CI (proposal — TC-1)

Based on the current repository (app already on `main`; four long-lived module branches; one CI workflow for M4's library only):

| Decision | Recommendation |
|---|---|
| Shared base | **`main`** — single trunk; no `dev` branch at this project size |
| Feature branches | short-lived **`feat/<module>-<slug>`** (e.g. `feat/m4-entitlement-route`), PR into `main` |
| CI file | **`.github/workflows/app-ci.yml`** |
| CI name | **`Shared app CI`** |
| Required checks on `main` | `M4 library tests` (exists) + `Shared app CI` (new) |
| Test environment | CI build for now; add a preview deployment later under the name `preview` |

**Why:** the app scaffold and vault feature already live on `main`, and every module PR is based on it; the review gate already exists. The real risk is the long-lived module branches (`feat/m1-*`, `feat/m2-*`, `feat/m5-*`, `feat/m6-*`) drifting from `main`.

**What `Shared app CI` should run:** `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm build` → `pnpm test:vault` (ubuntu only; the M4 library workflow keeps its ubuntu+windows matrix). No secrets needed if the build tolerates empty public env values; public Supabase keys may be added as CI variables (never the service-role key).

**Rollout:** (1) merge the long-lived module branches into `main` via PRs, starting with M2's `feat/m2-signup-paywall`; (2) add `app-ci.yml`; (3) mark both checks required on `main`; (4) everyone branches from `main` with the naming above.

## 5. What M4 needs from each module

| Owner | Ask |
|---|---|
| **M1 (Suraji)** | Written confirmation of the retention/history positions; the privacy-notice alignment and where the privacy link will live |
| **M2 (Lahiru)** | Merge `getSubscriptionContext` onto `main`; apply the `public.subscriptions` schema; state the RLS/persistence convention for M4-written history rows; confirm branch/CI |
| **M3 (Prashni)** | Name the schema steward and confirm the final field names (X-01) |
| **M5 (Vishmi)** | Confirm the exact fields the admin dashboard reads from M4 (X-13), or explicitly accept M4's minimal proposal |
| **M6 (Suraji)** | Consumer review of M4's two design inputs (P0 #6) |
| **Manager / team** | Confirm branch/CI (`main` + `Shared app CI`), the test-harness second hat, and a Sinhala/Singlish reviewer |

## 6. Blocked or parked (do not expect these yet)

- **Live AI:** no key/money provided → X-09 closure, live acceptance, 500-message run, prompt tuning and pilot metrics are **parked**.
- **Route adapter + real entitlement:** waits on M2's helper on `main` and the shared branch/CI.
- **Persistence (history/feedback/usage):** waits on the RLS convention, schema and shared branch.
- **M4-12 link-warning display:** waits on an owner design decision.
- **Language sign-off:** waits on the reviewer.

## 7. What teammates should do this week

- [ ] Reply **“agreed — <item> — <your name> — <date>”** for the items in §3.
- [ ] Merge your long-lived module branch into `main` (M2 first).
- [ ] Confirm branch/CI (`main` + `Shared app CI`) or propose a different name.
- [ ] M3: name the steward + field names. M5: send the field list. M6: schedule the consumer review.
- [ ] Don't create new long-lived module branches; use `feat/<module>-<slug>` → PR → `main`.

## 8. Where things live

- What M4 needs from every module: `docs/m4-cross-module-asks.md` (#27)
- What every module takes from M4: `docs/m4-what-other-modules-need.md` (#28)
- M4 local rules and evidence flags: `docs/m4-v2-local-rules.md`
- Offline phone-shape library: `docs/m4-phone-shape-metadata.md` (#30)
- Questions for M4: @Svishwa2004
