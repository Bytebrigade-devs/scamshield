# M4 v0.2 — Sri Lankan local-rules adaptation and review fixes

Implements the catalogue v0.2-draft amendment (owner language decision 24 Oct 2026: English + Sinhala-script + conservative Singlish cues, no accuracy claims, Tamil unsupported) and the seven-finding review response. Evidence-only discipline is unchanged: a rule match is evidence to review, never a verdict, score, category or incident claim; no network I/O.

## New rule hypotheses (R-M4-13…20)

- **R-M4-13** prize/reward win claimed via a message-supplied link (no fee/credential needed).
- **R-M4-14** parcel/delivery/customs fee or address-update demand at a message link.
- **R-M4-15** government fine/tax payment under deadline pressure.
- **R-M4-16** unauthorized-transfer "cancel it here" phishing.
- **R-M4-17** investment doubling/guaranteed-return hype (narrowed risk-disclosure suppressor).
- **R-M4-18** shortened-URL flag; **R-M4-19** abuse-TLD/brand-lookalike/`.apk` shape flags (no whole-message trusted-domain suppressor — one official link can never launder a scam link).
- **R-M4-20** instant-loan/easy-money offer with an amount and a message link.

Plus Sinhala/Singlish cue extensions to the shared vocabularies (PRIZE/FEE_NOUN/DEMAND/SECRET/PRESSURE). Sinhala cues use script lookbehinds (JS `\b` is ASCII-only) and ZWJ-optional conjuncts; the negation guard remains English-only (documented asymmetry).

## Review fixes included

- #2: R-M4-19 laundering suppressor removed. #5: R-M4-17 disclaimer bypass closed (narrowed suppressor). #6: the Sinhala investment cue ආයෝජන spelled out in explicit code points (the previous class pattern never matched the correct spelling). #4: preprocessing `urls` stays strictly verbatim — line-wrapped URL readings are disclosed only via the optional `wrappedCandidates` note.

## Verification

Repository suite on this branch (after the same-day recheck round): **84 tests pass** (31 preprocessing + 53 rule-engine), all network-free. Workspace-side sweep over the 52-pair/104-message fixture: 103/103 evaluated expectations satisfied, zero mismatches, one review-required case (workspace-only artifact). Full per-finding trail is in the owner workspace: `evidence/M4-review-response-20261024.md` and `evidence/M4-local-rules-adaptation-20261024.md`.

## PR review hardening — 27 October 2026

Current repository suite: **91/91 pass** (33 preprocessing + 58 rule-engine), verified locally with Node **v24.22.1**. The 84-test count above is the historical 24 October snapshot. No new accuracy or coverage claim follows from these regression tests.

- R-M4-18 recognizes shortener hosts with no path, a query or a fragment. Actual hostname parsing prevents username, path, query-value and suffix-domain lookalikes from masquerading as shorteners. Destinations are never fetched. A bare host mention is still only a shape cue, not proof of a working redirect or a malicious link.
- R-M4-20 no longer joins a currency prefix to a small amount across line breaks or paragraphs. Amount tokens are bounded while grouped forms (`Rs. 250 000`, `LKR 2,000,000`) remain supported. The existing 320-character context bound still applies between rule cues; bare large numbers remain an imperfect amount heuristic.
- Preprocessing retains raw URL endpoints when considering wraps but refuses to stitch across sentence punctuation; `path.\n/next` must not invent `path./next`. Verbatim URL spans and explicitly disclosed guessed readings stay separate.
- Added paired coverage for `asked/asking for` credential demands, ordinary requests and prohibitions. The generic R-M4-19 host-shape rule deliberately still matches names such as `my-pay-later.com`; it does not compare brands, confirm impersonation or establish maliciousness. The ordinary Singlish verb `karanna` likewise needs prize context and a destination, but can still match benign prize-related wording. These are documented draft limitations, not suppressed by an invented domain allow-list.
- `.github/workflows/m4-tests.yml` runs the library tests on Windows and Linux with Node 24.22.1, read-only permissions and SHA-pinned actions, without installing dependencies. GitHub execution remains unverified until the branch is published. No UI, workspace fixtures or evidence tooling is added to Git.
