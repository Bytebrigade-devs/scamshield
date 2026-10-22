/**
 * M4-03 — Pipeline stage 1 preprocessing: extraction tests (TDD, written first).
 *
 * Requirement: FR-M4-02 — "Preprocessing shall extract URLs, email addresses and phone
 * candidates from the submitted message without fetching URL destinations. Compare extraction
 * against expected synthetic sets, including text with no candidates. Extracted identifiers are
 * untrusted candidates, not verified identities."
 * Failure/edge alignment: FS-M4-04 (Unicode preserved, no crash), FS-M4-02 note (no silent
 * truncation — input capping is FR-M4-01 server validation, out of this stage's scope).
 *
 * Runner: Node's built-in test runner (`node --test`), zero dependencies.
 * This is the M4-19/X-06 starting convention, PROPOSED pending team confirmation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates } from './preprocess.ts';

test('extracts http/https/www URLs from mixed text', () => {
  const r = extractCandidates(
    'Reset your password at http://old-mail.example/reset NOW or visit www.secure-check.example/login and https://bank-alert.example/verify today.'
  );
  assert.deepEqual(r.urls, [
    'http://old-mail.example/reset',
    'www.secure-check.example/login',
    'https://bank-alert.example/verify',
  ]);
});

test('extracts email addresses (including .example fixture domains)', () => {
  const r = extractCandidates('Send the codes to support@windpetal-reset.example before lunch.');
  assert.deepEqual(r.emails, ['support@windpetal-reset.example']);
});

test('extracts phone candidates in local and international spellings', () => {
  const r = extractCandidates('Call +94 77 123 4567, 077 123 4567, or +1 (555) 123-4567 today.');
  assert.deepEqual(r.phones, ['+94 77 123 4567', '077 123 4567', '+1 (555) 123-4567']);
});

test('text with no candidates returns empty sets (FR-M4-02 expected-set case)', () => {
  const r = extractCandidates('Hello team, the review meeting is at 10 in the library tomorrow.');
  assert.deepEqual(r, { urls: [], emails: [], phones: [] });
});

test('empty, whitespace-only and garbage input return empty sets without throwing', () => {
  for (const input of ['', '   \n\t ', '### ??? !!!', '<></>&']) {
    assert.deepEqual(extractCandidates(input), { urls: [], emails: [], phones: [] });
  }
});

test('Unicode (Sinhala) text is preserved and processed without crashing (FS-M4-04)', () => {
  const r = extractCandidates('නූතන වංචා සඳහා https://example.lk/info බලන්න');
  assert.deepEqual(r.urls, ['https://example.lk/info']);
  // No language assessment is claimed — extraction is language-agnostic by design.
});

test('trailing punctuation is not part of the URL candidate', () => {
  const r = extractCandidates('See https://example.com/help. Next sentence.');
  assert.deepEqual(r.urls, ['https://example.com/help']);
});

test('duplicate candidates are reported once, first-occurrence order kept', () => {
  const r = extractCandidates('https://a.example/x then text then https://a.example/x again');
  assert.deepEqual(r.urls, ['https://a.example/x']);
});

test('precedence: an email inside a URL is not double-extracted (non-overlapping)', () => {
  const r = extractCandidates('visit http://site.example/a@b.example now');
  assert.deepEqual(r.urls, ['http://site.example/a@b.example']);
  assert.deepEqual(r.emails, []);
});

test('phone digits inside a URL path are not extracted as a phone candidate', () => {
  const r = extractCandidates('see https://pay.example/0771234567 for details');
  assert.deepEqual(r.urls, ['https://pay.example/0771234567']);
  assert.deepEqual(r.phones, []);
});

test('long input is processed in full — no silent truncation (FS-M4-02 note)', () => {
  const filler = 'lorem ipsum dolor sit amet '.repeat(120); // > 2,500 chars
  const r = extractCandidates(filler + 'https://example.com/verify');
  assert.deepEqual(r.urls, ['https://example.com/verify']);
  // Over-cap rejection belongs to FR-M4-01 server-side validation, not this stage.
});

test('fixture-grounded: synthetic pair M4-PH06-S extracts exactly its expected set', () => {
  const r = extractCandidates(
    'Windpetal Studio IT desk: send your current email password to support@windpetal-reset.example so we can complete your mailbox reset before lunch.'
  );
  assert.deepEqual(r, {
    urls: [],
    emails: ['support@windpetal-reset.example'],
    phones: [],
  });
});
