/**
 * M4 UI prototype — safe display helpers (F5 carried forward from PR #13/M4-04).
 *
 * Rule-engine excerpts, stage-1 candidates and the submitted message are UNTRUSTED text.
 * Everything the UI renders passes through these helpers.
 *
 * `sanitizeText` is LENGTH-PRESERVING on purpose: it replaces each dangerous UTF-16 code
 * unit with one U+FFFD, so rule-match `start`/`end` offsets measured on the original text
 * remain valid after sanitisation. That lets the UI highlight evidence spans without
 * ever injecting untrusted characters into the DOM.
 *
 * Neutralised: C0/C1 control characters (except tab and newline), zero-width space,
 * bidi embedding/override/isolate controls (e.g. U+202E, U+2066-U+2069), BOM, and
 * interlinear annotation controls. ZWJ/ZWNJ (U+200C/U+200D) are PRESERVED because
 * Sinhala-script text legitimately uses them for conjuncts.
 *
 * This module is plain ESM so the same file runs in the browser and under `node --test`.
 */

/** Format/control code points that must never reach the rendered DOM:
 *  C0/C1 (except tab/newline), zero-width space, LRM/RLM, Arabic Letter Mark (U+061C),
 *  bidi embedding/override/isolate controls, line/paragraph separators (U+2028/2029),
 *  BOM, and interlinear annotation controls. ZWJ/ZWNJ (U+200C/U+200D) are PRESERVED
 *  because Sinhala-script text legitimately uses them for conjuncts. */
const FORBIDDEN_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF\uFFF9-\uFFFB]/g;

/** Replace each dangerous code unit with U+FFFD, preserving string length and offsets. */
export function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(FORBIDDEN_RE, '\uFFFD');
}

/** HTML-escape for any string that is ever concatenated into markup. */
export function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Display form for a URL/identifier candidate: no control or bidi characters, and
 * whitespace collapsed so a wrapped candidate cannot masquerade across lines.
 * Never makes the value navigable — callers render it as inert text.
 */
export function sanitizeCandidate(value) {
  if (typeof value !== 'string') return '';
  return sanitizeText(value).replace(/\s+/g, ' ').trim();
}
