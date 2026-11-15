# What Other Modules Need From M4

**From:** Svishwa — M4 owner, AI Scam Checker · **Handle:** @Svishwa2004
**Date:** 15 November 2026 · **Status:** factual handover note — no new approval, commitment or shared acceptance is claimed.

> **This file is standalone.** It needs no other document and no access to the M4 workspace. It is the reverse-direction companion to the modules' own requests to M4 and can be uploaded to GitHub as-is.

---

## 0. One-minute summary

| Module | What that module needs from M4 | Is it available? |
|---|---|---|
| **M1 — Landing / onboarding / privacy** | Privacy-notice wording + data-flow; scam category vocabulary; official guidance/next-step content and valid destinations | **Available to review now** (design/content prepared; live wiring pending) |
| **M2 — Signup / paywall / subscription** | The plan/quota/usage model and how M4 enforces it; the session/entitlement fields M4 needs; usage-accounting rules | **Available now** (plan table owner-confirmed; M2's contract still needed to wire it) |
| **M3 — Vault (and possible schema steward)** | M4's proposed field needs and exclusions for the shared schema — only if M3 takes the schema-steward role | **Available now** (inputs supplied); otherwise nothing is needed |
| **M5 — Admin / analytics** | The usage/category event M4 would emit; the evidence summary; category labels | **Proposed, ready for M5's review** (M5's field list still needed) |
| **M6 — Digital Safety Score (coordinator Suraji)** | M4's message-input rules + 16 synthetic scoring cases; scam-activity input definition; scam-guidance and destinations; stories/relationships/checker-to-score notes; conditional threat-feed content | **Delivered 20 Oct, receipted 21 Oct** (consumer review pending) |
| **Manager / team** | Report-ready evidence and limits; status/blockers; later evaluation results | **Available now** (future results depend on the API-key decision) |

**Contact for anything here:** Svishwa (@Svishwa2004) in the team group chat. M4 will answer questions, share drafts and adjust its side where possible; nothing is sent or published automatically.

---

## 1. M1 — Landing, onboarding and privacy (owner: Suraji)

**What M1 can take from M4:**

1. **Privacy-notice wording and data-flow description.** M4 wrote and owner-reviewed the text shown before a message is submitted: that the message text goes to an AI provider, that people must not paste passwords/OTPs/bank keys, and where the privacy information belongs. **Use it to align the M1 privacy page and signup flow.**
   *Boundary:* this is a design/wording contribution — it is not final legal copy, and the privacy-link destination is still undecided.
2. **Scam category vocabulary.** Five static category IDs with plain-language labels and short definitions (a shared taxonomy proposal). M1 may reuse them for education/landing content and a later digest. *Boundary:* proposal only — no M1 content is authored by M4, and the taxonomy still needs consumer review.
3. **Official guidance and next-step content.** The neutral "what to do next" wording (don't follow the link, don't share passwords, contact your bank independently) and the list of reviewed official destinations with source/date notes. Some official sources were unavailable when reviewed (two banks and a courier were unreachable), and M4 records them as unavailable rather than inventing contacts.
   *Boundary:* M4 does not promise live links, reachability or institutional endorsement.

**What M4 needs back from M1** is listed in the companion asks note (privacy review, link destination, retention position).

---

## 2. M2 — Signup, paywall and subscription (owner: Lahiru)

**What M2 can take from M4:**

1. **The plan and quota model.** Three named plans with monthly/quarterly/annual prices, checks per month/day, trial allowance, a short burst limit (5 checks per minute) and proposed history windows. The M2 owner already confirmed these plans for the paywall; **the numbers, labels and trial rule are available for the paywall screens and copy.**
   *Boundary:* payments stay mocked; no real subscription, invoice or spending commitment is implied.
2. **The entitlement fields M4 needs** — so M2 can shape its contract once: what identifies a plan, its status, its expiry, and how a request proves the user is signed in. M4's server side is already built around a slot for exactly that.
3. **Usage-accounting rules M4 already enforces** — so the paywall and the checker don't disagree: monthly allowance is anchored at first use, a failed/AI-unavailable check does not consume quota, burst limits are enforced, and a rejected request never counts as a check.
4. **The privacy rule for access decisions:** M4 never needs the message text to decide access — an identity/plan decision must not depend on scam content.

**Boundary:** M2 owns auth/paywall; M4 owns the checker boundary. Neither side is integrated until M2's contract exists.

---

## 3. M3 — Password vault (owner: Prashni), and the proposed schema-steward role

**What M3 needs from M4 — only if M3 takes the shared-schema (X-01) review:**

- M4's **proposed field needs and exclusions** for four things: a safety *check*, a *finding*, a *usage event*, and a *history row*. M4 has supplied its scam entities/relationships input and the minimal event shapes.
  *Boundaries:* no tables, migrations or database code have been created by M4; M4 stores no vault data, no credentials and never reads M3's vault content.

**If M3 does not take the schema-steward role: M3 needs nothing from M4.**

---

## 4. M5 — Admin and analytics (owner: Vishmi)

**What M5 can take from M4:**

1. **A proposed usage/category event** (one M4 check outcome) with a small allowlisted set of fields — no message text, no snippets, no contacts, and no direct account identifier in the default form. This is the input M5's dashboard would use.
2. **A proposed evidence summary** (availability, attempt status, limitations, and a latest-attempt note) — no score, no verdict value, no raw check-count reward, and no "protective action completed" signal.
3. **Category IDs, labels and definitions** for dashboard grouping.

**What M5 needs to tell M4:** which of those fields the dashboard actually reads, and whether the labels work — M4 will adjust its side to match. Until then the event and summary are **proposals**, not implemented APIs.

---

## 5. M6 — Digital Safety Score (coordinator: Suraji)

**What M6 can take from M4** (all delivered as a self-contained bundle on 20 October 2026; receipts recorded 21 October):

| Item | What it gives M6 | Status / boundary |
|---|---|---|
| **Message-input rules + limitations, with 16 synthetic scoring cases** | What a "scam input" means for M6, what it can and cannot conclude, and worked qualitative cases | Delivered, receipted; **consumer review pending**. No weights or numeric scores supplied. |
| **Scam-activity input definition** | The safe shape of scam-activity evidence M4 can supply later (subject-scoped, no raw messages) | Design input delivered; runtime implementation is later M4 work. |
| **Scam guidance and official destinations** | Corrective-action guidance and destination inventory for M6/M1 selection | Delivered, receipted; **consumer review pending**. No invented routes or action-completion claim. |
| **Stories, relationships and checker-to-score notes** | How a check result becomes score input, in plain terms, for the assembled M6 draft | Delivered, receipted; **assembled-draft review pending**. |
| **Curated threat-feed content** | Optionally, source/date-attributed items for M1 display | **Conditional stretch — not committed.** Needs a team capacity decision. |

**Important boundaries M6 can rely on:** no raw messages, snippets, contacts or credentials enter any M4→M6 export; running more checks must never increase safety by itself; an unavailable result is not evidence of safety or danger; subscription/payment values do not influence the score; and M4 may remain non-scoring until a reviewed model supports it.

**What M4 needs back from M6:** a consumer review of the two design inputs and a yes/no on the scam-activity input and guidance destinations (see the companion asks note).

---

## 6. Manager and whole team

1. **Report-ready evidence and honest limits.** M4's interim contribution is submitted; current verification numbers, test/browser evidence and explicit "not yet run" lists are maintained and can be quoted in the final report.
2. **Status and blockers.** M4's remaining work is either (a) waiting on another owner, (b) waiting on the API-key/funding decision, or (c) an owner decision. Nothing is silently dropped — the blockers are listed in M4's asks note.
3. **Evaluation/pilot results later.** The 500-message detector run, prompt tuning and any accuracy discussion need a funded API key first; until then M4 reports only local regression evidence, never accuracy.

---

## 7. What M4 will NOT supply to anyone (so nobody waits for it)

- Raw user messages, snippets or message contents in any shared export or score.
- Account identifiers, credentials, OTPs, keys or passwords inside analytics/score data.
- A score, weight, formula, probability or "verified incident" claim from M4 checks.
- A "safe" verdict, a guaranteed protection outcome, or a claim that a check prevented a scam.
- Invented official links, phone numbers or recovery promises.
- Real-user or accuracy/coverage claims from small synthetic samples.

---

## 8. How to request something from M4

1. Ask in the team chat or send the item directly to @Svishwa2004.
2. Say **what you need, for which screen/feature, and by when** — M4 will confirm whether it already exists, can be supplied, or is blocked.
3. If it changes a shared contract or needs review, M4 records it with a date and links it to the owning module — a chat agreement alone does not close a gate.
4. Anything containing AI-dependent results waits for the funded-key decision; everything else above is available now.
