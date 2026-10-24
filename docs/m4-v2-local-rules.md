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

Repository suite on this branch: **84 tests pass** (31 preprocessing + 53 rule-engine), all network-free. Workspace-side sweep over the 52-pair/104-message fixture: 103/103 evaluated expectations satisfied, zero mismatches, one review-required case (workspace-only artifact). Full per-finding trail is in the owner workspace: `evidence/M4-review-response-20261024.md` and `evidence/M4-local-rules-adaptation-20261024.md`.
