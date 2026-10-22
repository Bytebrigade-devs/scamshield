/**
 * M4-04 — Stage 2 rule-based static analysis: rule-engine tests (TDD, written first).
 *
 * Requirement: FR-M4-03 — "Local static analysis shall apply documented scam-pattern rules and
 * record which rules matched. Check scam fixtures and paired legitimate near-matches; a keyword
 * match alone is not confirmation of an incident." NFR-M4-11 (reproducible evidence).
 *
 * Grounding: each pair below is the exact text of the synthetic fixture pair named in its test
 * (testing/M4-synthetic-pairs.json), chosen because the proposed rule catalogue
 * (testing/M4-rule-catalogue.md) lists that pair as the rule's own positive example / legitimate
 * near-match. Fixture JSON is used read-only and is not modified by this work.
 *
 * HONESTY BOUNDARY: the catalogue's 12 rules are owner-accepted as an interim PLANNING artifact
 * only — not approved executable detector logic. This suite therefore pins the behaviour of a
 * DRAFT rule library implementing those hypotheses. Output is "which rules matched + quoted
 * evidence spans" — never a verdict, score, category or incident claim.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRules, checkDisplayTarget } from './rule-engine.ts';

// ---- exact fixture texts (pair IDs recorded; source: testing/M4-synthetic-pairs.json) ----
const PH01_S = 'Your bank account will be suspended in 30 minutes. Verify your password at https://account-verify.example/restore to keep access.';
const PH01_L = 'Your bank account review is due in 30 minutes. Do not send your password. Open the banking app you already use to check whether any action is needed; this message cannot verify your account status.';
const PH02_S = 'Harborleaf Bank login alert: reply with the one-time code from your phone so our agent can cancel this login. Keep this verification chat open.';
const PH02_L = 'Harborleaf Bank login alert: never reply with a one-time code from your phone. Review this login in the banking app you already installed, or use your independently saved bank contact.';
const PH03_S = 'Moonreed Campus portal maintenance: enter your student password at https://moonreed-help.example/check to prevent your timetable account being disabled tonight.';
const PH03_L = 'Moonreed Campus portal maintenance tonight: read the public schedule at https://moonreed-help.example/check. Do not enter a password there; use your independently bookmarked campus portal to review your timetable.';
const RO01_S = 'My love, although we have never met, send LKR 48000 for my flight to Colombo today. I cannot video call or let you speak to the travel agent; trust our relationship.';
const RO01_L = 'My love, I checked the LKR 48000 flight to Colombo for our trip. We can compare bookings together when we meet; do not transfer money to anyone from this message.';
const IN01_S = 'Invoice FI-101 from Bluefern Listings: pay LKR 9500 today for your mandatory directory entry, even if you never ordered it. Do not ask purchasing; late payment will shut your listing.';
const IN01_L = 'Invoice FI-101 from Bluefern Listings: LKR 9500 for the directory entry on purchase order PO-101. Please reconcile with purchasing and your existing supplier record before the normal payment run.';
const IN02_S = 'Bluefern Supplies invoice FI-102 is due. Use our new beneficiary today and ignore the supplier record. Do not call your usual contact; that will delay dispatch.';
const IN02_L = 'Bluefern Supplies invoice FI-102 is due. New beneficiary details require a hold until purchasing calls the usual contact from the existing supplier record. Do not pay on this email alone.';
const PR01_S = 'You won the Mistfern draw: LKR 500000 awaits. Pay a LKR 5000 processing fee today to release your prize; you do not need to have entered.';
const PR01_L = 'Your entry won the Mistfern draw. Collection is free, with no processing fee; confirm through the contest desk on your original entry receipt before arranging collection.';
const PR02_S = 'Sunreed award winner: reply with your bank login and password so we can deposit your prize. Your award expires if you ask the organizer to verify this request.';
const PR02_L = 'Sunreed award winner: no bank login or password is needed to collect your prize. Confirm the collection arrangements with the organizer through the contact on your original event programme.';
const PR05_S = 'Moonfern free draw update: pay our agent LKR 3000 to guarantee better winning odds today. Your existing free entry will be cancelled unless you buy this upgrade.';
const PR05_L = 'Moonfern free draw update: your existing entry remains valid with the same winning odds. No upgrade payment is requested; read the rules through the organiser details on your original entry form.';
const OT01_S = 'Fernpeak Jobs offers you a Colombo assistant role without an interview. Pay LKR 6000 registration today to secure the job; we cannot disclose the employer until you pay.';
const OT01_L = 'Fernpeak Jobs invites you to interview for a Colombo assistant role. No registration fee is payable by applicants; verify the employer and interview through the listing you applied to before sharing any documents.';
const OT05_S = 'Petalspire Payroll sent your first cheque with extra equipment money. Deposit it and immediately send the surplus to our agent before the bank finishes its checks. Your job depends on doing this now.';
const OT05_L = 'Petalspire Payroll may have sent an incorrect cheque amount. Do not forward any surplus to an agent. Contact payroll through your existing employment record and your bank independently before arranging a documented correction.';

function firedIds(text: string): string[] {
  return analyzeRules(text).matches.map((m) => m.ruleId);
}

// ---- catalogue example pairs: positive fires, legitimate near-match stays silent ----

test('R-M4-01/02/03: M4-PH01-S fires the catalogue rules; M4-PH01-L is silent', () => {
  const s = firedIds(PH01_S);
  for (const id of ['R-M4-01', 'R-M4-02', 'R-M4-03']) assert.ok(s.includes(id), `${id} must fire on PH01-S`);
  assert.deepEqual(firedIds(PH01_L), [], 'PH01-L (negated password warning) must fire nothing');
});

test('R-M4-02: M4-PH02-S fires; M4-PH02-L ("never reply with") is silent', () => {
  assert.ok(firedIds(PH02_S).includes('R-M4-02'));
  assert.deepEqual(firedIds(PH02_L), []);
});

test('R-M4-02/03: M4-PH03-S fires; M4-PH03-L ("do not enter a password there") is silent', () => {
  const s = firedIds(PH03_S);
  assert.ok(s.includes('R-M4-02'));
  assert.ok(s.includes('R-M4-03'));
  assert.deepEqual(firedIds(PH03_L), [], 'URL + negated password mention is not a credential request');
});

test('R-M4-04: M4-RO01-S fires; M4-RO01-L ("do not transfer money") is silent', () => {
  assert.ok(firedIds(RO01_S).includes('R-M4-04'));
  assert.deepEqual(firedIds(RO01_L), [], 'affection + airfare amount without a transfer demand is not romance fraud');
});

test('R-M4-05/06: M4-IN01-S fires; M4-IN01-L (PO context, no demand) is silent', () => {
  const s = firedIds(IN01_S);
  assert.ok(s.includes('R-M4-05'));
  assert.ok(s.includes('R-M4-06'));
  assert.deepEqual(firedIds(IN01_L), []);
});

test('R-M4-05/06: M4-IN02-S fires (payee change + bypass); M4-IN02-L (hold + callback) is silent', () => {
  const s = firedIds(IN02_S);
  assert.ok(s.includes('R-M4-05'));
  assert.ok(s.includes('R-M4-06'));
  assert.deepEqual(firedIds(IN02_L), []);
});

test('R-M4-07: M4-PR01-S fires; M4-PR01-L ("no processing fee") is silent', () => {
  assert.ok(firedIds(PR01_S).includes('R-M4-07'));
  assert.deepEqual(firedIds(PR01_L), []);
});

test('R-M4-08: M4-PR02-S fires; M4-PR02-L ("no bank login ... is needed") is silent', () => {
  assert.ok(firedIds(PR02_S).includes('R-M4-08'));
  assert.deepEqual(firedIds(PR02_L), []);
});

test('R-M4-07: M4-PR05-S (odds upgrade pressure) fires; M4-PR05-L ("No upgrade payment") is silent', () => {
  assert.ok(firedIds(PR05_S).includes('R-M4-07'));
  assert.deepEqual(firedIds(PR05_L), []);
});

test('R-M4-09: M4-OT01-S fires; M4-OT01-L ("No registration fee is payable") is silent', () => {
  assert.ok(firedIds(OT01_S).includes('R-M4-09'));
  assert.deepEqual(firedIds(OT01_L), []);
});

test('R-M4-10: M4-OT05-S fires; M4-OT05-L ("Do not forward any surplus") is silent', () => {
  assert.ok(firedIds(OT05_S).includes('R-M4-10'));
  assert.deepEqual(firedIds(OT05_L), []);
});

// ---- R-M4-11 stub: explicit display/target metadata only (shortener/threshold OPEN) ----

test('R-M4-11 stub: display/target mismatch fires; identical or absent metadata is silent', () => {
  const mismatch = checkDisplayTarget('secure bank login', 'http://account-verify.example/restore');
  assert.deepEqual(mismatch.map((m) => m.ruleId), ['R-M4-11']);
  assert.deepEqual(checkDisplayTarget('bank.example', 'bank.example'), []);
  assert.deepEqual(checkDisplayTarget('', ''), []);
  assert.deepEqual(checkDisplayTarget(undefined, undefined), []);
  // Plain text with no supplied metadata must never produce an R-M4-11 match (catalogue rule).
  assert.deepEqual(firedIds(PH01_S).filter((id) => id === 'R-M4-11'), []);
});

// ---- evidence integrity and contract shape (FR-M4-07 spirit) ----

test('every reported excerpt is a literal substring of the submitted text', () => {
  for (const text of [PH01_S, PH02_S, PH03_S, RO01_S, IN01_S, IN02_S, PR01_S, PR02_S, PR05_S, OT01_S, OT05_S]) {
    for (const m of analyzeRules(text).matches) {
      assert.ok(text.includes(m.excerpt), `excerpt "${m.excerpt}" must appear verbatim in the submitted text`);
    }
  }
});

test('PH01-S evidence reflects the fixture-recorded spans (no invented evidence)', () => {
  const r = analyzeRules(PH01_S);
  const excerpts = r.matches.map((m) => m.excerpt).join(' | ');
  assert.ok(excerpts.includes('uspended'), 'R-M4-01 evidence should quote the suspension threat');
  assert.ok(excerpts.includes('assword'), 'R-M4-02/03 evidence should quote the password request');
});

test('contract: matches carry ruleId + excerpt only; no verdict/score/category field exists', () => {
  const r = analyzeRules(PH01_S);
  assert.deepEqual(Object.keys(r), ['matches']);
  for (const m of r.matches) {
    const keys = Object.keys(m);
    assert.ok(keys.includes('ruleId') && keys.includes('excerpt'));
    for (const k of keys) assert.ok(['ruleId', 'excerpt', 'contextNote'].includes(k), `unexpected field ${k}`);
    assert.ok(typeof m.ruleId === 'string' && m.ruleId.startsWith('R-M4-'));
    assert.ok(typeof m.excerpt === 'string' && m.excerpt.length > 0);
  }
});

// ---- edge cases (M4-15 alignment: empty/garbage/Unicode/long input) ----

test('empty, whitespace and garbage input return no matches without throwing', () => {
  for (const input of ['', '   \n\t ', '### ??? !!!', '<script>alert(1)</script>']) {
    assert.deepEqual(analyzeRules(input), { matches: [] });
  }
});

test('Unicode (Sinhala) text is processed without throwing and claims nothing', () => {
  assert.deepEqual(analyzeRules('මෙය පරීක්ෂා කිරීම සඳහා වන පණිවිඩයකි.'), { matches: [] });
});

test('long input is processed in full — a cue at the end still matches (no truncation)', () => {
  const filler = 'lorem ipsum dolor sit amet '.repeat(120); // > 2,500 chars
  const s = firedIds(filler + ' ' + PH01_S);
  for (const id of ['R-M4-01', 'R-M4-02', 'R-M4-03']) assert.ok(s.includes(id), `${id} must fire near end of long input`);
});

test('a keyword match alone is not an incident: matched rules carry no verdict semantics', () => {
  // FR-M4-03 guard, pinned as behaviour: even the strongest positive has no verdict field or
  // incident flag — callers must interpret matches as evidence, not conclusions.
  const r = analyzeRules(PR02_S);
  assert.ok(r.matches.length >= 1);
  for (const m of r.matches) {
    assert.ok(!('verdict' in m) && !('incident' in m) && !('score' in m) && !('category' in m));
  }
});
