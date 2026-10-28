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
import { readFileSync } from 'node:fs';
import { extractCandidates } from './preprocess.ts';

test('review follow-up: ordinary next-line text and contacts are never reconstructed as URL paths', () => {
  for (const separator of ['\n', '\r\n']) {
    for (const ending of ['/', '/help-', '/path']) {
      for (const next of ['Please call 0771234567.', '0771234567', '+94 77 123 4567', 'support@bank.example']) {
        const r = extractCandidates(`Visit https://site.example${ending}${separator}${next}`);
        assert.equal(r.wrappedCandidates, undefined, `${ending} followed by ${next}`);
        assert.deepEqual(r.urls, [`https://site.example${ending}`]);
      }
    }
  }
});

test('review follow-up: a following complete URL is separate even after a trailing slash', () => {
  const r = extractCandidates('https://a.example/\nhttps://b.example/info');
  assert.deepEqual(r.urls, ['https://a.example/', 'https://b.example/info']);
  assert.equal(r.wrappedCandidates, undefined);
});

test('URL prefixes are case-insensitive while candidate spelling stays verbatim', () => {
  assert.deepEqual(extractCandidates('HTTPS://bank.example/Login HTTP://other.example WWW.bank.example').urls,
    ['HTTPS://bank.example/Login', 'HTTP://other.example', 'WWW.bank.example']);
});

test('separate complete phone numbers survive spaces, tabs and line breaks', () => {
  for (const separator of [' ', '\t', '\n', '\r\n']) {
    const text = `0771234567${separator}0712345678`;
    assert.deepEqual(extractCandidates(text).phones, ['0771234567', '0712345678']);
  }
  assert.deepEqual(extractCandidates('+94 77 123 4567 +1 (555) 123-4567').phones,
    ['+94 77 123 4567', '+1 (555) 123-4567']);
  assert.deepEqual(extractCandidates('0771234567 071 234 5678').phones, ['0771234567', '071 234 5678']);
  assert.deepEqual(extractCandidates('0771234567 011234567').phones, ['0771234567', '011234567']);
});

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

// --- M4-15 partial: conservative line-wrapped URL readings (v0.2 slice, review fix #4) ---

test('a wrap with explicit URL syntax keeps the verbatim fragment and discloses the reading separately', () => {
  const text = 'Claim https://peth-claim.example/winner-\nlist?ref=1 today';
  const r = extractCandidates(text);
  assert.deepEqual(r.urls, ['https://peth-claim.example/winner-']);
  assert.deepEqual(r.wrappedCandidates, ['https://peth-claim.example/winner-list?ref=1']);
  // Review fix #4: urls stay strictly verbatim substrings of the submitted text.
  assert.ok(text.includes(r.urls[0]));
  assert.ok(!text.includes(r.wrappedCandidates[0]), 'the joined reading removes the line break and is not a substring');
});

test('multi-line wraps produce one stitched reading, still verbatim-fragment first', () => {
  const r = extractCandidates('https://a.example/x\n/y\n/z end');
  assert.deepEqual(r.urls, ['https://a.example/x']);
  assert.deepEqual(r.wrappedCandidates, ['https://a.example/x/y/z']);
});

test('plain word continuations remain ambiguous even after a slash or mid-token hyphen', () => {
  for (const text of [
    'https://a.example/winner-\nlist today',
    'https://a.example/help-\nplease call us',
    'https://a.example/\nplease call us',
  ]) assert.equal(extractCandidates(text).wrappedCandidates, undefined, text);
});

test('a TLD-dot wrap still joins from the continuation side, a sentence period never does', () => {
  const tld = extractCandidates('see https://a.example\n/x today');
  assert.deepEqual(tld.wrappedCandidates, ['https://a.example/x']);
  const sentence = extractCandidates('visit www.second.example/path.\nmore text');
  assert.deepEqual(sentence.urls, ['www.second.example/path']);
  assert.equal(sentence.wrappedCandidates, undefined, 'a trailing period is sentence punctuation, not a wrap');
});

test('every reported url is a verbatim substring of the submitted text (review fix #4 pin)', () => {
  const texts = [
    'Claim https://peth-claim.example/winner-\nlist today',
    'see https://boc-verify-account.x\nyz/verify now',
    'Visit https://example.com\nNext sentence follows',
    'mixed https://a.example/x-\ny and www.second.example/path.\nmore',
  ];
  for (const text of texts) {
    const r = extractCandidates(text);
    for (const url of r.urls) assert.ok(text.includes(url), `"${url}" must appear verbatim`);
    for (const reading of r.wrappedCandidates ?? []) {
      assert.ok(!text.includes(reading), `stitched reading "${reading}" must never pose as a raw span`);
    }
  }
});

test('a word-like continuation is never joined (no invented candidate)', () => {
  const r = extractCandidates('Visit https://example.com\nNext sentence follows');
  assert.deepEqual(r.urls, ['https://example.com']);
  assert.equal(r.wrappedCandidates, undefined);
});

test('a following separate URL is not glued to the previous one', () => {
  assert.deepEqual(extractCandidates('https://a.example/abc\nhttps://b.example/def').urls,
    ['https://a.example/abc', 'https://b.example/def']);
});

test('an unstitched alphanumeric wrap keeps the verbatim first-line fragment', () => {
  const r = extractCandidates('verify at https://boc-verify-account.x\nyz/verify now');
  assert.deepEqual(r.urls, ['https://boc-verify-account.x']);
  assert.equal(r.wrappedCandidates, undefined);
});

// --- PR #13 review response — F2: trailing-punctuation trim is balance-aware ---

test('review hardening: sentence punctuation cannot be embedded in a stitched URL reading', () => {
  for (const punctuation of ['.', ',', ')']) {
    const result = extractCandidates(`See https://a.example/path${punctuation}\n/next`);
    assert.deepEqual(result.urls, ['https://a.example/path']);
    assert.equal(result.wrappedCandidates, undefined, 'punctuation terminates the candidate rather than moving inside a guessed URL');
  }
});

test('review follow-up: punctuation on any wrapped line terminates further stitching', () => {
  for (const punctuation of ['.', ',', ')']) {
    const result = extractCandidates(`https://a.example/path\n/next${punctuation}\n/again`);
    assert.deepEqual(result.urls, ['https://a.example/path']);
    assert.deepEqual(result.wrappedCandidates, ['https://a.example/path/next']);
  }
});

test('balanced parentheses stay in the URL candidate (Wikipedia-style titles)', () => {
  const r = extractCandidates('see https://en.wikipedia.org/wiki/Scam_(disambiguation) ok');
  assert.deepEqual(r.urls, ['https://en.wikipedia.org/wiki/Scam_(disambiguation)']);
});

test('unbalanced trailing closers are trimmed; balanced ones are kept', () => {
  const cases = [
    ['see https://example.com/a)) ok', 'https://example.com/a'],
    ['see https://en.wikipedia.org/wiki/Scam_(disambiguation)) ok', 'https://en.wikipedia.org/wiki/Scam_(disambiguation)'],
    ['see https://example.com/help. ok', 'https://example.com/help'],
  ] as const;
  for (const [input, expected] of cases) {
    assert.deepEqual(extractCandidates(input).urls, [expected]);
  }
});

test('a phone candidate keeps its span verbatim, stray mid-span paren included (F2 mirror)', () => {
  const input = 'call (077) 123-4567) done';
  const r = extractCandidates(input);
  assert.deepEqual(r.phones, ['077) 123-4567']);
  // The stray ')' is mid-span, not trailing: candidates are raw spans of the submitted
  // text (NFR-M4-04 — data, not trusted evidence); rewriting the span would fabricate it.
  assert.ok(input.includes(r.phones[0]));
});

// --- PR #13 review response — F3: a stray '+' must not start a phone match ---

test('a plus sign inside a digit run does not start a phone candidate (F3)', () => {
  // `12+34 567 890` used to yield `+34 567 890`: the `\+` branch of PHONE_RE lacked
  // the not-after-digit guard the other branch has, so a plus mid-number began a match.
  assert.deepEqual(extractCandidates('ref 12+34 567 890 end').phones, []);
  // Guard is "not after a digit", not "no plus at all" — a real international
  // spelling after text still extracts.
  assert.deepEqual(extractCandidates('call +34 567 890 now').phones, ['+34 567 890']);
});

// --- PR #13 review response — F4: over-long digit runs are dropped whole ---

test('an over-long digit run yields no phone candidate, and no sub-span is carved (F4)', () => {
  // 19 digits: the span finder reads the complete run,
  // then isValidPhone rejects the whole match — it never carves a 7–15-digit window
  // out of it, because any such window would be a number the sender never wrote.
  assert.deepEqual(extractCandidates('ref 0771234567890123456 end').phones, []);
  // The validator's real boundary: 15 digits passes, 16 does not.
  assert.deepEqual(extractCandidates('ref 077123456789012 end').phones, ['077123456789012']);
  assert.deepEqual(extractCandidates('ref 0771234567890123 end').phones, []);
});

// --- PR #13 review response — F1: the no-fetch clause now has backing evidence ---

test('FR-M4-02 first sentence: extraction runs without fetching URL destinations', () => {
  // Direct acceptance evidence for "without fetching URL destinations": a throwing
  // globalThis.fetch stub — any network attempt during extraction fails this test.
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = ((...args: unknown[]) => {
    fetchCalls += 1;
    throw new Error(`extractCandidates attempted network I/O: fetch(${String(args[0])})`);
  }) as unknown as typeof fetch;
  try {
    const r = extractCandidates(
      'see https://en.wikipedia.org/wiki/Scam_(disambiguation) or mail support@windpetal-reset.example, call +94 77 123 4567'
    );
    assert.deepEqual(r, {
      urls: ['https://en.wikipedia.org/wiki/Scam_(disambiguation)'],
      emails: ['support@windpetal-reset.example'],
      phones: ['+94 77 123 4567'],
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the module has zero imports — no dns/https path to host resolution exists (FR-M4-02)', () => {
  // Backs rule 1's "never resolves a host": in Node, DNS/HTTP clients are only
  // reachable through an import (a fetch stub cannot prove a negative for them), so
  // the dependency-free construction is the evidence — pinned here as a source check.
  const source = readFileSync(new URL('./preprocess.ts', import.meta.url), 'utf8');
  const importLike = /^\s*import\b|\brequire\s*\(|\bimport\s*\(|\bfrom\s+['"]/m;
  assert.ok(
    !importLike.test(source),
    'preprocess.ts must stay dependency-free: any import could reach node:dns/https'
  );
});
