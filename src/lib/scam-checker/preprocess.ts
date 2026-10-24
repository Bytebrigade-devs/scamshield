/**
 * M4-03 — Pipeline stage 1 preprocessing: candidate extraction.
 *
 * Requirement: FR-M4-02 — extract URLs, email addresses and phone candidates from the
 * submitted message WITHOUT fetching URL destinations. Extracted identifiers are UNTRUSTED
 * CANDIDATES, not verified identities; a keyword or candidate match alone is never incident
 * evidence (FR-M4-03 note).
 *
 * Design rules (each is pinned by a test in preprocess.test.ts):
 * 1. Pure string processing — this module performs no network I/O of any kind (never fetches
 *    a URL destination, never resolves a host). Safe by construction.
 * 2. Precedence URL > email > phone: candidate spans are non-overlapping, so an email or phone
 *    number appearing inside a URL is reported as part of the URL only, never double-counted.
 * 3. Each distinct candidate value is reported once, in first-occurrence order.
 * 4. Unicode-safe on any input (FS-M4-04): never throws, preserves non-ASCII text; extraction
 *    is language-agnostic and claims no language capability.
 * 5. No truncation: the full given text is processed (FS-M4-02 — input capping/rejection is
 *    FR-M4-01 server-side validation, out of this stage's scope).
 *
 * Test runner: Node built-in `node --test` with native TypeScript type stripping — zero
 * dependencies. Proposed M4-19/X-06 starting convention, pending team confirmation.
 */

/** Untrusted extraction candidates — see FR-M4-02. Not verified identities. */
export interface ExtractionCandidates {
  urls: string[];
  emails: string[];
  phones: string[];
}

interface Span {
  start: number;
  end: number;
  value: string;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/gu;
// Phone SPAN finder — deliberately wider than a phone number. A span starts with '+'
// or a digit-run start, never right after another digit (so a stray '+' inside a digit
// run cannot begin a match — PR #13 review, F3), and may carry common separators.
// The phone RULES — 7–15 digits, leading '+' or '0' — are enforced by isValidPhone
// below, not by this regex: an over-long digit run matches wide and is then rejected
// whole; no 7–15-digit window is carved from it, because any such window would be a
// number the sender never wrote (PR #13 review, F4).
const PHONE_RE = /(?<![0-9+])\+?[0-9][0-9 \t().-]*[0-9](?![0-9])/gu;
// Sentence punctuation is stripped from candidate tails. Bracket closers are stripped
// only when they are UNBALANCED within the matched value (count openers vs closers):
// a balanced pair belongs to the candidate (Wikipedia-style "Scam_(disambiguation)"
// URLs), a stray trailing one is punctuation (PR #13 review, F2).
const TRAILING_SENTENCE_RE = /[.,;:!?'"]+$/u;
const TRAILING_CLOSER_RE = /[)\]}]$/u;
const CLOSER_PAIRS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

function collect(re: RegExp, text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
  }
  return out;
}

function overlaps(span: Span, taken: Span[]): boolean {
  return taken.some((t) => span.start < t.end && t.start < span.end);
}

function uniqueInOrder(spans: Span[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of spans) {
    if (!seen.has(s.value)) {
      seen.add(s.value);
      out.push(s.value);
    }
  }
  return out;
}

function countOf(value: string, ch: string): number {
  let n = 0;
  for (const c of value) if (c === ch) n += 1;
  return n;
}

/**
 * Strip trailing sentence punctuation and, only when unbalanced in the matched value,
 * a trailing bracket closer. A balanced trailing closer is part of the candidate.
 */
function trimTrailing(value: string): string {
  let out = value.replace(TRAILING_SENTENCE_RE, '');
  while (TRAILING_CLOSER_RE.test(out)) {
    const closer = out[out.length - 1];
    if (countOf(out, closer) <= countOf(out, CLOSER_PAIRS[closer])) break;
    out = out.slice(0, -1);
    out = out.replace(TRAILING_SENTENCE_RE, '');
  }
  return out;
}

/** A scheme URL must have a dotted host (`https://intranet` is not a candidate). */
function isValidUrl(raw: string): boolean {
  if (/^www\./i.test(raw)) return true;
  const afterScheme = raw.slice(raw.indexOf('://') + 3);
  const authority = afterScheme.split(/[/?#]/)[0];
  return authority.includes('.');
}

function digitCount(value: string): number {
  let n = 0;
  for (const ch of value) if (ch >= '0' && ch <= '9') n += 1;
  return n;
}

function isValidPhone(raw: string): boolean {
  const digits = digitCount(raw);
  if (digits < 7 || digits > 15) return false;
  // Must start with '+' (international) or a leading '0' (local trunk prefix).
  if (raw.startsWith('+')) return true;
  return raw.startsWith('0');
}

/** Split an over-long span only at written separators before another local candidate.
 * Preserve a valid whole candidate when grouping is ambiguous; never split a digit run.
 * Newlines and '+' already terminate PHONE_RE spans.
 */
function phoneSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const span of collect(PHONE_RE, text)) {
    const whole = trimTrailing(span.value);
    if (isValidPhone(whole)) {
      out.push({ start: span.start, end: span.start + whole.length, value: whole });
      continue;
    }
    let offset = 0;
    for (const separator of span.value.matchAll(/[ \t]+(?=0[0-9])/g)) {
      const value = trimTrailing(span.value.slice(offset, separator.index));
      if (!isValidPhone(value)) continue;
      out.push({ start: span.start + offset, end: span.start + offset + value.length, value });
      offset = separator.index + separator[0].length;
    }
    const value = trimTrailing(span.value.slice(offset));
    if (isValidPhone(value)) out.push({ start: span.start + offset, end: span.start + offset + value.length, value });
  }
  return out;
}

/**
 * Extract untrusted URL / email / phone candidates from pasted message text.
 * Never throws; never performs network I/O; claims no verification or language capability.
 */
export function extractCandidates(text: string): ExtractionCandidates {
  if (typeof text !== 'string' || text.length === 0) {
    return { urls: [], emails: [], phones: [] };
  }

  const taken: Span[] = [];

  // 1) URLs (highest precedence), with trailing sentence punctuation excluded.
  const urlSpans: Span[] = [];
  for (const span of collect(URL_RE, text)) {
    const value = trimTrailing(span.value);
    if (value.length === 0 || !isValidUrl(value)) continue;
    const trimmed: Span = { start: span.start, end: span.start + value.length, value };
    if (!overlaps(trimmed, taken)) {
      taken.push(trimmed);
      urlSpans.push(trimmed);
    }
  }

  // 2) Emails, excluding any span already claimed by a URL.
  const emailSpans: Span[] = [];
  for (const span of collect(EMAIL_RE, text)) {
    if (!overlaps(span, taken)) {
      taken.push(span);
      emailSpans.push(span);
    }
  }

  // 3) Phone candidates, excluding any span already claimed.
  const acceptedPhones: Span[] = [];
  for (const span of phoneSpans(text)) {
    const value = trimTrailing(span.value);
    if (value.length === 0 || !isValidPhone(value)) continue;
    const trimmed: Span = { start: span.start, end: span.start + value.length, value };
    if (!overlaps(trimmed, taken)) {
      taken.push(trimmed);
      acceptedPhones.push(trimmed);
    }
  }

  return {
    urls: uniqueInOrder(urlSpans),
    emails: uniqueInOrder(emailSpans),
    phones: uniqueInOrder(acceptedPhones),
  };
}
