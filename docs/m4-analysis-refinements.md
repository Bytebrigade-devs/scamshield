# M4 preprocessing and draft rule refinements

These pure string-processing libraries implement M4-03/FR-M4-02 and M4-04/FR-M4-03. They extract untrusted candidates and return draft pattern evidence; they do not fetch destinations or produce a verdict, confidence score, category or incident finding.

## Behavior

- URL prefixes are case-insensitive, with original candidate spelling preserved. Adjacent local phone candidates survive spaces, tabs and line breaks, including a formatted second number. Continuous over-long digit runs are rejected whole; ambiguous valid grouping is preserved.
- Negation and paired evidence respect instruction boundaries. A prohibited password cannot supply evidence for a separate parcel or OTP request after “but”. Unrelated reassurance or inability does not negate a subsequent demand.
- Fee/credential nouns use a narrower guard than action verbs. Explicitly ignored supplier records do not suppress invoice demands, and explicit topic changes cannot connect unrelated cues.
- Additional documented romance, card-information, job-fee and cheque/onward-transfer wording is covered by regression tests. Depositing an employer cheque is distinguished from paying an upfront job fee.

## Evidence interface

`analyzeRules(text)` returns `{ matches }`. Each match retains `ruleId`, `excerpt` and optional `contextNote`, and now includes inclusive `start` and exclusive `end` offsets in JavaScript UTF-16 code units:

```typescript
text.slice(match.start, match.end) === match.excerpt
```

The offsets identify the qualifying occurrence in the original input, including repeated keywords and Unicode before a match. `checkDisplayTarget(display, target)` uses offsets in its supplied target string instead. That function remains a metadata comparison, not domain verification. Future callers constructing `RuleMatch` values must provide the two new position fields; rendering must treat all excerpts as untrusted text.

Context matching uses draft local bounds: 320 characters for related context, 80 for secret/request and job/payment pairs, and 160 for prize/payment evidence. These heuristics are not server input limits or validated efficacy thresholds. Complex negation, unseen wording and ambiguous context remain limitations.

## Validation

Requires Node 22.18 or later for native TypeScript stripping; verified with Node v24.22.0. No package installation is required:

```text
node --test src/lib/scam-checker/preprocess.test.ts src/lib/scam-checker/rule-engine.test.ts
```

The repository suite passes **52 tests**. It includes the earlier seven preprocessing-review regressions as well as the analysis refinements, evidence offsets, Unicode, long-input and no-fetch checks.

The owner workspace separately holds the frozen synthetic fixture and its stricter sweep. That run has **79 satisfied evaluated expectations, zero mismatches and one ambiguous case requiring review**, with **58 total workspace tests**. These workspace-only artifacts are not added to this repository. The dataset was used during refinement, so those results are regression evidence rather than held-out or real-world accuracy. Final detector criteria, domain review, provider integration and full-checker acceptance remain outstanding.
