# M4 — Cross-Module Asks (for every module owner)

**From:** Svishwa — M4 owner, AI Scam Checker · **Handle:** @Svishwa2004
**Date:** 15 November 2026 · **Status:** requests only — nothing here is approved, completed or sent on anyone's behalf.

> **This file is standalone.** It needs no other document and no access to the M4 workspace. Everything you need to answer is written here. It can be uploaded to GitHub as-is (repo `docs/`, an issue body, or a PR comment).

---

## 0. One-minute summary

M4 has finished everything it can do **without an AI key and without another module's decision**. Six things are now waiting on other people. Each owner only needs to read their own section.

| # | Who | What M4 needs in one line | What it unblocks |
|---|---|---|---|
| 1 | **M1 — Suraji** | Say yes/no to M4's privacy notice wording, where the privacy link should point, and the current retention position | M4's live privacy notice + privacy tests |
| 2 | **M2 — Lahiru** | Send the entitlement/session contract M4 should code against, and confirm the shared app branch/environment | M4's remaining boundary work, user history, feedback |
| 3 | **M3 — Prashni** | Confirm the shared schema direction for safety-check entities, or name who owns it | Saving usage counts and history durably |
| 4 | **M5 — Vishmi** | Confirm which usage/category fields the M5 dashboard actually reads | M4's category implementation |
| 5 | **M6 — Suraji** | Review the M6 inputs M4 delivered on 20 Oct and accept or reject them | M4's M6 contribution + P0 #6 |
| 6 | **Manager / team** | Decide funding + spend cap + who holds the API key; name one Sinhala/Singlish reviewer; confirm M4's test-harness second hat | All AI-dependent work; language review; test convention |

If you are not one of those people, you do not need to do anything — but you are welcome to read on.

---

## 1. Context (30 seconds, so nobody has to open another file)

- **M4 = AI Scam Checker.** A user pastes a suspicious message. M4 extracts links, emails and phone numbers **without opening them**, runs local scam rules, optionally asks an AI model for a judgement, and returns an honest result: **completed**, **rules-only** (labelled) or **unavailable** (never "safe").
- M4's current local build is verified on its own: **373 automated tests (372 pass; 1 sandbox-only failure), strict rule sweep 103/103, and browser evidence packets of 2,198 assertions with zero browser errors** (recorded 10–15 November 2026).
- The local code is **not** the shared app. M4's workspace is a standalone implementation; the shared product is the Next.js app in `scamshield`.
- Everything M4 can finish alone is finished. What remains is genuinely blocked on the six decisions below — **not** on more M4 coding.
- **M4 is not asking anyone to write code for it.** Each ask is a decision, a contract detail, or a review.

---

## 2. M1 — Suraji (@SurajiSaundarya): privacy alignment

**What M4 needs (three things):**

1. A **yes / no / changes** on M4's privacy-notice wording before a message is submitted — including the line that the message text is sent to an AI provider, and the warning not to paste passwords, OTPs or bank keys.
2. Where the **privacy link** should point (the final destination is still undecided).
3. The current **storage/retention** position for submitted text, in one or two sentences.

**Why it matters:** the notice is shown to real users; until M1 confirms wording and destination, M4 cannot honestly call it "live" or run its privacy alignment checks.

**What M4 already has ready:** an owner-reviewed notice/data-flow design with placement requirements, provider-transfer wording and the secrets warning — all written. M4 only needs the three answers above.

**What it unblocks:** M4's notice/privacy row (M4-21), the notice privacy tests, and the shared privacy alignment (M1-13).

**Suggested reply:** "Wording OK / needs changes: … · Privacy link should point to: … · Retention position: …"

---

## 3. M2 — Lahiru Achintha (@lahiruachintha23-bit): entitlement, session and shared app

**What M4 needs:**

1. The **entitlement/session contract** M4 should code against: what identifies a plan, its status and expiry, and how a request proves the user is signed in.
2. Which **branch/environment is the shared Next.js base** M4 should target (X-04/X-05), and whether CI/deployed environments are usable for M4 slices.
3. A one-line ruling: should **history and feedback rows** be owned by M2's auth layer or by M4.

**Why it matters:** M4's server boundary is built with a slot where entitlement plugs in, but the real contract does not exist yet, so it cannot be wired. User history and feedback also cannot be attributed or protected without login.

**What M4 already has ready:** the boundary service with injected ports (entitlement, usage, budget, provider, clock), quota and spend-cap logic, a one-attempt provider adapter with no retry/fallback, and structural reply validation — all tested locally.

**What it unblocks:** M4-02's remaining work, M4-07 (feedback), M4-08 (user history), and the thin Next.js route adapter.

**Suggested reply:** "Contract is at: … / I will send it by: … · Shared base branch: … · History/feedback owner: M2 / M4"

---

## 4. M3 — Prashni (@Prasnida): shared schema direction (X-01)

**What M4 needs:** confirm who owns the shared schema review, and confirm (or correct) the direction for four things before any table is created: a **safety check**, a **finding**, a **usage event**, and a **history row**. A short "these field names are fine / use these instead / not yet" is enough.

**Why it matters:** M4's usage counts currently live in memory and vanish on restart. Saving them needs a schema that the team agrees on; inventing column names now would only create rework.

**What M4 already has ready:** M4's scam entities/relationships input, a minimal usage-event shape (8 fields) and an evidence-summary shape (7 fields), plus the in-memory usage model as a reference.

**What it unblocks:** durable usage/spend enforcement and user-scoped history — i.e. M4-02's persistence piece and M4-08.

**Suggested reply:** "Schema owner: … · Entity/field direction: … · Blocked until: …"

---

## 5. M5 — Vishmi (@Vish-Himaya): which X-13 fields the dashboard reads

**What M4 needs:** a short list of the usage/category fields the M5 dashboard actually consumes, and a yes/no on whether M4's proposed labels work for those views.

**Why it matters:** M4 can implement categories, but only against fields a consumer really reads — otherwise the metadata is written for nobody.

**What M4 already has ready:** M4's X-13 producer proposal, the minimal usage event and evidence summary shapes, and the category/label proposal. M4 can adjust its side freely.

**What it unblocks:** M4-10 (categorization using validated X-13 IDs) and M5's dashboard views.

**Suggested reply:** "Fields used: … · Labels OK / change to: …"

---

## 6. M6 — Suraji (@SurajiSaundarya), M6 coordinator: consumer review

**What M4 needs:** a consumer review of the **M6-01** and **M6-09** drafts M4 delivered on **20 October** (receipt recorded 21 Oct), and a yes/no on **M6-04** (scam-activity input definition) and **M6-07** (guidance/destinations) as M4's contribution.

**Why it matters:** M4's P0 #6 stays open and M4's M6 producer work cannot start until a consumer review exists. M4's side is otherwise finished.

**What M4 already has ready:** the self-contained handover bundle — M6-01 input rules plus 16 synthetic scoring cases, the M6-04 definition, M6-07 guidance/destinations, and M6-09 notes. It was delivered to Lahiru, Vishmi and Suraji and receipted on 21 Oct.

**What it unblocks:** P0 #6 and M4's M6 producer implementation. **Important boundary:** M4 is not asking for agreed weights, scores, formulas or shared-version approval — only whether the input slices are acceptable.

**Suggested reply:** "M6-01/M6-09: accepted / needs changes: … · M6-04/M6-07: accepted / changes needed: …"

---

## 7. Manager / whole team — three decisions

### 7.1 Funding and the API key (X-09)

**Ask:** decide **whether the project funds a real OpenAI-compatible API key**, **what the hard spend cap is**, and **who holds the key**. If yes, also confirm the server-side environment-variable arrangement.
**Why:** every AI-dependent M4 task is parked on this one decision — live acceptance, the 500-message detector run, prompt tuning and any evaluation. M4's code already enforces a one-attempt call with a cap and no fallback; it simply has no authorized key.
**What M4 has ready:** the budget gate, the usage/spend model, and a complete one-action runbook for the day the key exists.
**Boundary:** no key value should ever be posted in chat or committed. M4 only needs the decision, the cap and the custodian.

### 7.2 One Sinhala/Singlish reviewer

**Ask:** name one person who can look at M4's Sinhala-script and Singlish scam-message wording and say "this reads correctly / this looks wrong".
**Why:** M4 makes no accuracy claim, but a human language review is the honest minimum before language wording is treated as reviewed.
**What M4 has ready:** the conservative cue/wording list; the review is small.

### 7.3 M4's proposed test-harness second hat (X-06 / M4-19)

**Ask:** confirm whether M4 keeps the proposed test-harness role and the zero-dependency `node --test` convention, or whether the team is standardising on another runner.
**Why:** M4-19 stays "proposed, not confirmed" until then, and the team will need one agreed test convention as the shared app grows. If the team picks another runner, M4's tests port mechanically.

---

## 8. What M4 does **not** need from anyone (so nobody is asked twice)

- No one needs to write or review M4's own code, docs, tracker or evidence records.
- Publication of M4's prepared repository branch and the demo-surface decisions are **M4 owner** decisions, not another module's.
- No design/visual approval work — M4's accepted designs are already owner-approved; new UI waits on an owner design decision.
- No AI help — the AI work is blocked only on the funding/key decision in §7.1.
- No one needs to provide real user data. M4 uses synthetic messages only.

---

## 9. How to reply (one template works for every ask)

Reply in the team chat, or on GitHub as a comment on this file/issue:

> **Ask #:** 1–6 / 7.1 / 7.2 / 7.3
> **Answer:** yes / no / changes needed (one line)
> **If changed:** what to use instead
> **Owner / date:** who confirmed it, and when

**Please reply even if the answer is "not yet"** — a date is more useful than silence, and M4 will record it.

---

## 10. What happens after a reply

1. M4 records the reply (dated) in its own tracker and evidence records.
2. If the reply changes a shared gate, the **owning module's acceptance** is what closes it — not this document and not a chat message.
3. Nothing in this file is an approval, a completed task, or a claim that M4's work is accepted by anyone.

---

## Appendix — recipients, and how to upload this file

**Recipients (team group chat + DM as needed):** Suraji (@SurajiSaundarya — M1 and M6 coordinator), Lahiru Achintha (@lahiruachintha23-bit — M2), Prashni (@Prasnida — M3), Vishmi (@Vish-Himaya — M5), the project manager, and the rest of the team for visibility.

**Upload options:**

- **GitHub issue (recommended):** suggested title `M4 — cross-module asks (15 Nov 2026)`; paste this whole file as the issue body and label it `module:m4`, `needs:decision`.
- **Repo doc:** save as `docs/m4-cross-module-asks.md` in `scamshield` and link it from the repo README's M4 row.
- **PR comment / chat:** the file is plain Markdown and reads correctly as-is.

**Do not** upload any file containing real keys, `.env` contents, real user messages or personal data — this document contains none.
