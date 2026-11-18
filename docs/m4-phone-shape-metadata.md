# M4 — Offline Sri Lankan phone-shape metadata (ported 15 November 2026)

Adds a **portable, offline** Sri Lankan phone-number shape reader to the M4 library. It upgrades plain-text phone candidates into a deterministic reading: "plausible Sri Lankan number" / "plausible LK mobile", so later slices can describe a number without guessing.

**Evidence-only discipline is unchanged:** this is shape classification from reviewed metadata. It never proves a number is allocated, reachable, subscribed, or owned by the sender; it produces **no** operator attribution (mobile number portability); a non-LK or unnormalisable value is **unclassified**, never "invalid" and never "safe". No accuracy, reputation or incident claim follows.

## Files

| File | Role |
|---|---|
| `src/lib/scam-checker/preprocess/phone-metadata.ts` | `normaliseLkPhone()` → E.164; `classifyPhone()` → `{ raw, e164, lkNumber, lkMobile }` |
| `src/lib/scam-checker/preprocess/lk-phone-metadata.generated.ts` | Generated typed metadata (**do not hand-edit**) |
| `src/lib/scam-checker/preprocess/vendor/lk-phonenumber-metadata.json` | Reviewed, vendored LK numbering facts + provenance + limits |
| `src/lib/scam-checker/preprocess/scripts/generate-lk-phone-metadata.ts` | SHA-256-pinned offline generator, `--check` reproducible |
| `src/lib/scam-checker/preprocess/phone-metadata.test.ts` | 6 tests: normalisation forms, classification, fail-closed behaviour, no-network construction, pinned source |

## Source and licence

- **Source:** `libphonenumber-js` **1.12.10** `metadata.max.json` — **MIT** (upstream Google libphonenumber metadata is Apache-2.0).
- **Source artifact SHA-256:** `bf12a8429a7a9db1d292c74f0fea1830d921965b4eedbe4e4206d4a966d13e97`; metadata format version 4.
- **Vendored file SHA-256:** `b6fa2d2905c77ce9cf67a971455fbb942865793bf4c7377d5f2d6571fa5b9664` (pinned in the generator; mismatch is a hard failure).
- **Extracted LK facts:** calling code `94`, trunk prefix `0`, international prefix `00`, national pattern `[1-9]\d{8}`, possible lengths `[9]`, mobile pattern `7(?:[0-25-8]\d|4[0-4])\d{6}`, fixed-line pattern recorded in the vendor JSON.
- **TRCSL note:** the TRCSL site was reachable but no machine-readable allocation table was parsed; the metadata is the reviewed shape source and **no TRCSL allocation/operator claim is made**.

## Accepted written forms

`0XXXXXXXXX` (trunk) · `+94XXXXXXXXX` · `0094XXXXXXXXX` · bare `XXXXXXXXX` · bare `94XXXXXXXXX`. Separators (spaces, tabs, dots, hyphens, brackets) are ignored for digit extraction; the raw candidate is preserved and never rewritten.

## Limits

1. **Shape only** — no allocation, reachability, subscriber or operator claim; no portability lookup.
2. Other countries are **unclassified**, never "invalid"/"safe".
3. The mobile pattern is a reviewed snapshot; prefix reallocations are not inferred.
4. Refreshing the metadata is a reviewed decision, not a silent update: download the pinned version, verify the recorded SHA-256, update the vendor JSON, run the generator, and record a dated evidence note.

## Scope of this repository slice

This slice is now the **full pipeline integration, not only the portable library**. The M4 workspace reading is wired into pipeline stage 1 (`phoneInsights` on `extractCandidates`) with its integration test, and the 18 November 2026 sync published both together, so the earlier "portable library only / integration not ported" note is superseded. No UI change, no provider/AI call, no deployment, no frozen fixture or prior evidence change.

## Verification

```powershell
node src/lib/scam-checker/preprocess/scripts/generate-lk-phone-metadata.ts --check   # integrity + reproducibility
node --test "src/lib/scam-checker/**/*.test.ts"                                      # library suite (CI: ubuntu + windows)
```

Recorded at port time: generator check **exit 0** (integrity `b6fa2d29…`) and the library suite green (the new file adds **6 tests**). The workspace-side record with the full source review and limits is `evidence/M4-phone-metadata-20261115.md`.
