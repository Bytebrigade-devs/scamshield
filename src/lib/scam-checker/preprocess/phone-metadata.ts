/**
 * M4 — Offline Sri Lankan phone-number SHAPE classification (15 November 2026).
 *
 * Purpose: upgrade the plain-text phone candidates produced by stage 1 into a deterministic,
 * offline "plausible Sri Lankan number / plausible LK mobile" reading, so later slices can
 * describe a number without guessing. This is the Tier-0 item from
 * evidence/M4-scam-detection-mechanisms-research-20261113.md §6 — it needs no AI model, no API
 * key, no external service and no network.
 *
 * Design rules (each pinned by phone-metadata.test.ts):
 * 1. Pure string processing. No network, DNS, operator lookup or number-portability query is
 *    performed here or anywhere it is called from.
 * 2. The reviewed numbering metadata is vendored and pinned (see vendor/lk-phonenumber-metadata.json
 *    and lk-phone-metadata.generated.ts). Moving it is a reviewed decision, not a silent update.
 * 3. `raw` is preserved exactly as extracted; normalisation never rewrites the candidate the
 *    sender wrote. The E.164 reading is a separate, clearly labelled field.
 * 4. SHAPE ONLY. A match never proves allocation, reachability, ownership, or that the sender
 *    owns the number. No operator is named (mobile number portability). A non-LK or
 *    unnormalisable candidate is "unclassified", never "invalid" and never "safe".
 * 5. Unicode-safe and never throws on any string (Framework stage-1 contract).
 */
import { LK_NUMBERING } from './lk-phone-metadata.generated.ts';

/** Offline shape reading for one extracted phone candidate. */
export interface PhoneInsight {
  /** The candidate exactly as extracted; never rewritten by this module. */
  raw: string;
  /** E.164 reading (`+94XXXXXXXXX`) for a valid Sri Lankan shape, otherwise null. */
  e164: string | null;
  /** True when the candidate normalises to a Sri Lankan (+94) number shape. */
  lkNumber: boolean;
  /** True when the national number matches the reviewed LK mobile pattern. */
  lkMobile: boolean;
}

const CALLING_CODE = LK_NUMBERING.countryCallingCode;
const NATIONAL_RE = new RegExp(`^${LK_NUMBERING.nationalNumberPattern}$`, 'u');
const MOBILE_RE = new RegExp(`^${LK_NUMBERING.mobilePattern}$`, 'u');
const NATIONAL_LENGTH = 9;

function digitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Normalise an untrusted candidate to E.164 **only when it has a valid Sri Lankan shape**.
 * Accepted written forms: `0XXXXXXXXX` (trunk prefix), `+94XXXXXXXXX`, `0094XXXXXXXXX`,
 * bare `XXXXXXXXX` national digits, and bare `94XXXXXXXXX`. Everything else returns null.
 */
export function normaliseLkPhone(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length === 0) return null;
  const digits = digitsOf(text);
  if (digits.length === 0) return null;

  let national: string | null = null;
  if (text.startsWith('+')) {
    // Explicit international form: only +94 is normalised; other countries stay unclassified.
    if (!digits.startsWith(CALLING_CODE)) return null;
    national = digits.slice(CALLING_CODE.length);
  } else if (digits.startsWith(`00${CALLING_CODE}`)) {
    national = digits.slice(2 + CALLING_CODE.length);
  } else if (digits.startsWith(LK_NUMBERING.trunkPrefix)) {
    national = digits.slice(LK_NUMBERING.trunkPrefix.length);
  } else if (digits.length === NATIONAL_LENGTH) {
    national = digits;
  } else if (digits.length === CALLING_CODE.length + NATIONAL_LENGTH && digits.startsWith(CALLING_CODE)) {
    // Bare country code without '+', e.g. "94 77 123 4567".
    national = digits.slice(CALLING_CODE.length);
  }

  if (national === null) return null;
  if (national.length !== NATIONAL_LENGTH || !NATIONAL_RE.test(national)) return null;
  return `+${CALLING_CODE}${national}`;
}

/** Classify one candidate. Never throws; unclassified results carry no safety meaning. */
export function classifyPhone(raw: string): PhoneInsight {
  const e164 = normaliseLkPhone(raw);
  if (e164 === null) return { raw, e164: null, lkNumber: false, lkMobile: false };
  const national = e164.slice(CALLING_CODE.length + 1);
  return { raw, e164, lkNumber: true, lkMobile: MOBILE_RE.test(national) };
}

/** The reviewed numbering metadata this module classifies against (shape facts only). */
export const LK_SHAPE_SOURCE = LK_NUMBERING.source;
