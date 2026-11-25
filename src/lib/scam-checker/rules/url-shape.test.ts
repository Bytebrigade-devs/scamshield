/**
 * M4-12 tail — v0.3-draft URL-shape rules (R-M4-21…23): TDD evidence.
 *
 * Requirement: FR-M4-11 — "URL flagging shall report supported shortener, misspelling,
 * excessive-subdomain and explicit display-target mismatch findings separately from the message
 * verdict. Check suspicious and legitimate URLs; assess mismatch only when both display and
 * target are actually available. No new crawling, threat-intelligence or OCR service."
 *
 * HONESTY BOUNDARY: R-M4-21…23 are engineering-acceptance shape flags over the reviewed
 * projection in reviewed-reference.ts. A flag is evidence for review only — never a reputation,
 * impersonation or malicious-domain finding, and no URL is fetched, resolved or opened.
 * Thresholds are documented catalogue decisions (testing/M4-rule-catalogue.md v0.3-draft).
 *
 * ID namespace: R-M4-xx are catalogue rule-hypothesis IDs, NOT the Final report's requirement IDs.
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRules } from './rule-engine.ts';
import {
  REVIEWED_BRANDS, SPELLING_REFERENCES, isReviewedOfficialHost, isSingleEditApart,
  registrableDomain, subdomainDepth,
} from './reviewed-reference.ts';

const ids = (text: string): string[] => analyzeRules(text).matches.map(match => match.ruleId);
const matchesOf = (text: string, ruleId: string) => analyzeRules(text).matches.filter(match => match.ruleId === ruleId);

// ---- R-M4-21: excessive subdomain depth ----

test('R-M4-21: three or more labels above the registrable domain is shape evidence', () => {
  const text = 'Your parcel is held. Open secure.login.verify.account.pethpost.lk to release it.';
  const found = matchesOf(text, 'R-M4-21');
  assert.equal(found.length, 1);
  assert.equal(found[0].contextNote, 'excessive-subdomain-depth:4');
  assert.equal(found[0].excerpt, 'secure.login.verify.account.pethpost.lk');
  assert.equal(text.slice(found[0].start, found[0].end), found[0].excerpt);
});

test('R-M4-21: two labels above the registrable domain stays silent (www/hosted subdomain controls)', () => {
  for (const text of [
    'Read the schedule at https://www.sampath.lk/help today.',
    'Support is at https://support.microsoft.com/help.',
    'The public notice is at https://bank.review.example/notice.',
  ]) assert.deepEqual(ids(text).filter(id => id === 'R-M4-21'), []);
});

test('R-M4-21: the documented two-level suffix keeps .lk registrable names at depth zero', () => {
  assert.equal(subdomainDepth('sampath.lk'), 0);
  assert.equal(subdomainDepth('www.sampath.lk'), 1);
  assert.equal(subdomainDepth('a.b.sampath.lk'), 2);
  assert.equal(subdomainDepth('a.b.c.sampath.lk'), 3);
  assert.equal(subdomainDepth('x.y.example.co.uk'), 2);
  assert.equal(subdomainDepth('a.b.c.example.co.uk'), 3);
  assert.equal(registrableDomain('edlcare.edl.lk'), 'edl.lk');
});

// ---- R-M4-22: single-edit misspelling of a reviewed official domain label ----

test('R-M4-22: one-character substitution, deletion, insertion or transposition is evidence', () => {
  for (const [text, token] of [
    ['Your bank alert: confirm at sampathk.lk/login today.', 'sampathk.lk'],
    ['Your bank alert: confirm at sampat.lk/login today.', 'sampat.lk'],
    ['Your bank alert: confirm at smapath.lk/login today.', 'smapath.lk'],
    ['Pay here: paypa1.com/confirm', 'paypa1.com'],
  ] as const) {
    const found = matchesOf(text, 'R-M4-22');
    assert.equal(found.length, 1, `expected one R-M4-22 for ${text}`);
    assert.equal(found[0].excerpt, token);
    assert.equal(text.slice(found[0].start, found[0].end), found[0].excerpt);
  }
});

test('R-M4-22: reviewed official hosts, subdomains of them and unrelated hosts stay silent', () => {
  for (const text of [
    'Visit https://www.sampath.lk or https://boc.lk for official contacts.',
    'Visit https://accounts.google.com/security or https://support.microsoft.com.',
    'The library is at https://fernpetal.example/help.',
    'Meeting notes are at https://docs.example.com/agenda.',
  ]) assert.deepEqual(ids(text).filter(id => id === 'R-M4-22'), []);
});

test('R-M4-22: reference labels are long enough to be meaningful and hyphen-free', () => {
  assert.ok(SPELLING_REFERENCES.length >= 6);
  for (const reference of SPELLING_REFERENCES) {
    assert.ok(reference.label.length >= 6, reference.label);
    assert.ok(!reference.label.includes('-'), reference.label);
  }
});

test('R-M4-22: distance helper distinguishes exactly one edit from two', () => {
  assert.equal(isSingleEditApart('sampath', 'sampath'), false); // equal is not a misspelling
  assert.equal(isSingleEditApart('sampath', 'sampat'), true);
  assert.equal(isSingleEditApart('sampath', 'sampathk'), true);
  assert.equal(isSingleEditApart('sampath', 'smapath'), true);
  assert.equal(isSingleEditApart('sampath', 'sampathxy'), false);
  assert.equal(isSingleEditApart('sampath', 'sxmpathx'), false);
});

// ---- R-M4-23: named reviewed brand vs non-reviewed link host, same sentence ----

test('R-M4-23: a reviewed brand named beside a non-reviewed link host is evidence', () => {
  const text = 'Sampath Bank alert: verify your account at sampath-bank.top/login today.';
  const found = matchesOf(text, 'R-M4-23');
  assert.equal(found.length, 1);
  assert.equal(found[0].contextNote, 'link-host-not-reviewed-for:sampath-bank');
  assert.equal(found[0].excerpt, 'sampath-bank.top');
  assert.equal(text.slice(found[0].start, found[0].end), found[0].excerpt);
});

test('R-M4-23: a long link written BEFORE the brand still fires on the real gap (review E#57)', () => {
  // The gap must be measured link↔brand, not from the link's start: a 150-character path in
  // front of the brand used to push the distance past 160 and hide the finding.
  const longPath = 'a'.repeat(150);
  const close = `Open https://sampath-bank.top/${longPath} before you reply — Sampath Bank says your account is locked.`;
  const found = matchesOf(close, 'R-M4-23');
  assert.equal(found.length, 1);
  assert.ok(found[0].excerpt.startsWith('https://sampath-bank.top/'));
  assert.equal(close.slice(found[0].start, found[0].end), found[0].excerpt);
  // Control: the same long link, then a genuinely far-away brand (>160 characters later) stays silent.
  const farFiller = 'and this is a long filler comment without punctuation that keeps going '.repeat(3);
  const far = `Open https://sampath-bank.top/${longPath} ${farFiller}Sampath Bank is mentioned far away.`;
  assert.deepEqual(matchesOf(far, 'R-M4-23'), []);
});

test('R-M4-23: the reviewed host for that brand, a separate sentence, or no brand stays silent', () => {
  for (const text of [
    'Sampath Bank alert: check your account at https://www.sampath.lk.',
    'Sampath Bank alert: check your account. The library notice is at https://fernpetal.example/help.',
    'Check the notice at https://fernpetal.example/help for library hours.',
    'Bank of Ceylon branch hours are listed at https://www.boc.lk/branches.',
  ]) assert.deepEqual(ids(text).filter(id => id === 'R-M4-23'), []);
});

test('R-M4-23: unrelated brand aliases in the reference stay inert on ordinary text', () => {
  for (const text of [
    'The apple harvest starts next week in Nuwara Eliya.',
    'Search on google for the official number yourself, the message is suspicious.',
  ]) assert.deepEqual(ids(text).filter(id => id === 'R-M4-23'), []);
});

test('R-M4-23: a generic descriptor beside a real link is not a brand claim (25 Nov 2026 regression)', () => {
  // A genuine CEB bill lists its own payment host and the post office as alternatives. "post
  // office" used to be an sl-post alias, so R-M4-23 fired on the CEB link and the message was
  // rated suspicious — a false alarm found by the owner's language review of the 500-message run.
  const ceb = 'CEB: bill for account 00XXXXX is Rs. 4,320, due 4 November. Register with REG 00XXXXX '
    + 'to 1987 for bill alerts. Payment is only at payment.ceb.lk or the post office.';
  assert.deepEqual(ids(ceb).filter(id => id === 'R-M4-23'), []);
  // Control: removing a generic alias must not disarm the rule for the real institution.
  // Brand and link must share one sentence — a full stop between them is deliberately silent.
  for (const post of [
    'Sri Lanka Post: your parcel is held, pay Rs 850 at slpost-fee.com today.',
    'Department of Posts warning: settle the fee at slpost-fee.com now.',
  ]) {
    const found = analyzeRules(post).matches.filter(match => match.ruleId === 'R-M4-23');
    assert.equal(found.length, 1, post);
    assert.equal(found[0].contextNote, 'link-host-not-reviewed-for:sl-post');
  }
});

// ---- Shape parsing must not invent hosts from ordinary text ----

test('shape rules never treat times, versions, abbreviations, emails or file names as hosts', () => {
  for (const text of [
    'The meeting is at 10.30 a.m. in room 4.2, version 1.2.3 is installed.',
    'Write to desk@fernpetal.example or call the office; e.g. the accounts team.',
    'Open Pethpost-verify.apk to release your parcel.',
  ]) {
    const found = analyzeRules(text).matches.filter(match => ['R-M4-21', 'R-M4-22', 'R-M4-23'].includes(match.ruleId));
    assert.deepEqual(found, [], `unexpected shape flag in: ${text}`);
  }
});

test('shape rules leave the documented cue-table matches and their order unchanged', () => {
  const text = 'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';
  const matches = analyzeRules(text).matches;
  assert.equal(matches[0].ruleId, 'R-M4-01');
  assert.ok(matches.every(match => text.slice(match.start, match.end) === match.excerpt));
});

test('reviewed reference recognises official hosts and subdomains only as reference evidence', () => {
  assert.equal(isReviewedOfficialHost('www.sampath.lk'), true);
  assert.equal(isReviewedOfficialHost('login.sampath.lk'), true);
  assert.equal(isReviewedOfficialHost('sampath.lk.example.com'), false);
  for (const brand of REVIEWED_BRANDS) {
    assert.ok(brand.officialHosts.length > 0, brand.organizationId);
    assert.ok(brand.aliases.length > 0, brand.organizationId);
  }
});
