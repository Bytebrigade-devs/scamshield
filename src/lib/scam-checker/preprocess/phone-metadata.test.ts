/**
 * M4 — offline Sri Lankan phone-shape classification tests (15 November 2026).
 *
 * Requirement link: M4-15 (edge cases/graceful behaviour) and FR-M4-02 (untrusted candidates).
 * Tier-0 research item: evidence/M4-scam-detection-mechanisms-research-20261113.md §6.
 *
 * Boundaries pinned here: shape-only (never allocation/reachability/operator), raw candidate
 * preserved, no network I/O, additive optional extraction field, unclassified is not "safe".
 *
 * Runner: Node's built-in test runner (`node --test`), zero dependencies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhone, normaliseLkPhone, LK_SHAPE_SOURCE } from './phone-metadata.ts';
import { extractCandidates } from './preprocess.ts';
import { LK_NUMBERING } from './lk-phone-metadata.generated.ts';

test('normalises the written Sri Lankan forms to E.164', () => {
  assert.equal(normaliseLkPhone('0771234567'), '+94771234567');
  assert.equal(normaliseLkPhone('071 234 5678'), '+94712345678');
  assert.equal(normaliseLkPhone('076-123-4567'), '+94761234567');
  assert.equal(normaliseLkPhone('+94 77 123 4567'), '+94771234567');
  assert.equal(normaliseLkPhone('0094 75 123 4567'), '+94751234567');
  assert.equal(normaliseLkPhone('771234567'), '+94771234567');
  assert.equal(normaliseLkPhone('94 77 123 4567'), '+94771234567');
  assert.equal(normaliseLkPhone('  0771234567  '), '+94771234567');
});

test('other countries, wrong lengths and impossible shapes stay unclassified (never "invalid" or "safe")', () => {
  assert.equal(normaliseLkPhone('+1 (555) 123-4567'), null);
  assert.equal(normaliseLkPhone('+44 7700 900123'), null);
  assert.equal(normaliseLkPhone('077123456'), null); // 8 national digits
  assert.equal(normaliseLkPhone('077123456789012'), null); // over-long digit run
  assert.equal(normaliseLkPhone('940771234567'), null); // 0-prefixed oddity, wrong length
  assert.equal(normaliseLkPhone(''), null);
  assert.equal(normaliseLkPhone('   '), null);
  assert.equal(normaliseLkPhone('call me'), null);
  assert.equal(normaliseLkPhone(42 as unknown as string), null); // never throws on non-strings
  const unclassified = classifyPhone('+1 (555) 123-4567');
  assert.deepEqual(unclassified, { raw: '+1 (555) 123-4567', e164: null, lkNumber: false, lkMobile: false });
});

test('classifies mobile versus fixed-line shape from the reviewed metadata, with raw preserved', () => {
  assert.deepEqual(classifyPhone('0771234567'), {
    raw: '0771234567', e164: '+94771234567', lkNumber: true, lkMobile: true,
  });
  assert.deepEqual(classifyPhone('0712345678'), {
    raw: '0712345678', e164: '+94712345678', lkNumber: true, lkMobile: true,
  });
  assert.deepEqual(classifyPhone('0740123456'), {
    raw: '0740123456', e164: '+94740123456', lkNumber: true, lkMobile: true,
  });
  assert.deepEqual(classifyPhone('0112345678'), {
    raw: '0112345678', e164: '+94112345678', lkNumber: true, lkMobile: false,
  });
  // Metadata boundary: 0745 is not in the reviewed mobile pattern. Reported as non-mobile
  // shape, NOT as fake — allocation is never inferred from shape.
  assert.deepEqual(classifyPhone('0745123456'), {
    raw: '0745123456', e164: '+94745123456', lkNumber: true, lkMobile: false,
  });
  // Shape-only limit: 099… has a valid national SHAPE but is not a known mobile allocation.
  assert.deepEqual(classifyPhone('0991234567'), {
    raw: '0991234567', e164: '+94991234567', lkNumber: true, lkMobile: false,
  });
});

test('perform no network I/O of any kind', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('phone-metadata performed network I/O');
  }) as typeof fetch;
  try {
    for (const value of ['0771234567', '+94 77 123 4567', '+1 555 123 4567', 'not a number']) {
      classifyPhone(value);
      normaliseLkPhone(value);
    }
    extractCandidates('Call 0771234567 or +1 555 123 4567 before 5pm.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('extraction reports insights additively, preserving the plain candidate shape', () => {
  const withPhones = extractCandidates('Call 0771234567 or +1 555 123 4567 today.');
  assert.deepEqual(withPhones.phones, ['0771234567', '+1 555 123 4567']);
  assert.deepEqual(withPhones.phoneInsights, [
    { raw: '0771234567', e164: '+94771234567', lkNumber: true, lkMobile: true },
    { raw: '+1 555 123 4567', e164: null, lkNumber: false, lkMobile: false },
  ]);
  // Key absent when there are no phone candidates, so callers comparing the plain shape are unaffected.
  assert.equal('phoneInsights' in extractCandidates('Hello team, the review is tomorrow.'), false);
  assert.deepEqual(extractCandidates('Hello team, the review is tomorrow.'),
    { urls: [], emails: [], phones: [] });
});

test('the vendored numbering source is pinned and shape-fact only', () => {
  assert.equal(LK_NUMBERING.countryCallingCode, '94');
  assert.deepEqual([...LK_NUMBERING.possibleLengths], [9]);
  assert.equal(LK_NUMBERING.source.vendoredSha256, 'b6fa2d2905c77ce9cf67a971455fbb942865793bf4c7377d5f2d6571fa5b9664');
  assert.equal(LK_SHAPE_SOURCE.licence, 'MIT');
  assert.equal(LK_SHAPE_SOURCE.reviewedAt, '2026-11-15');
});
