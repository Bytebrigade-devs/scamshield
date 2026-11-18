/**
 * F5 display-safety tests: untrusted excerpts must be neutralised without breaking
 * rule-match offsets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, sanitizeCandidate, sanitizeText } from './public/render-safe.js';

test('sanitizeText removes bidi overrides and isolates', () => {
  const hostile = 'safe\u202Etxet desrever\u2066isolated\u2069';
  const cleaned = sanitizeText(hostile);
  for (const ch of ['\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069']) {
    assert.equal(cleaned.includes(ch), false, `U+${ch.codePointAt(0)!.toString(16)} must be removed`);
  }
});

test('sanitizeText removes C0/C1 controls except tab and newline', () => {
  const cleaned = sanitizeText('a\u0000b\u0007c\u001bd\u0085e\tf\ng');
  assert.equal(cleaned, 'a\uFFFDb\uFFFDc\uFFFDd\uFFFDe\tf\ng');
});

test('sanitizeText is length-preserving so rule offsets stay valid', () => {
  const original = 'Your bank account will be suspended in 30 minutes.\u202E Verify your password.';
  const cleaned = sanitizeText(original);
  assert.equal(cleaned.length, original.length);
  // A rule match measured on the original can still slice the sanitised copy.
  const span = original.slice(26, 49);
  assert.equal(span, 'suspended in 30 minutes');
  assert.equal(cleaned.slice(26, 49), span);
});

test('sanitizeText preserves Sinhala conjunct zero-width joiners', () => {
  const sinhala = '\u0D85\u200D\u0D9A\u200C\u0DBB'; // ZWJ + ZWNJ are legitimate here
  assert.equal(sanitizeText(sinhala), sinhala);
});

test('sanitizeText removes zero-width space, BOM and interlinear controls', () => {
  const cleaned = sanitizeText('a\u200Bb\uFEFFc\uFFF9d\uFFFBe');
  assert.equal(cleaned, 'a\uFFFDb\uFFFDc\uFFFDd\uFFFDe');
});

test('sanitizeText removes Arabic Letter Mark and line/paragraph separators', () => {
  const cleaned = sanitizeText('a\u061Cb\u2028c\u2029d');
  assert.equal(cleaned, 'a\uFFFDb\uFFFDc\uFFFDd');
});

test('sanitizeText leaves ordinary Unicode intact', () => {
  const text = 'ඔබගේ ගිණුම — SMS: ₹1,000 “urgent” ✓';
  assert.equal(sanitizeText(text), text);
});

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">&\''),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;',
  );
});

test('sanitizeCandidate strips controls and collapses whitespace without navigating', () => {
  const candidate = '  https://account-verify.example/\u202E restore\nnext  ';
  const display = sanitizeCandidate(candidate);
  assert.equal(display, 'https://account-verify.example/\uFFFD restore next');
  assert.equal(/[\u202A-\u202E\u2066-\u2069]/.test(display), false);
});
