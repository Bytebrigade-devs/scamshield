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
 * HONESTY BOUNDARY: the catalogue's rules (v0.1 rows R-M4-01…12, owner-accepted 20 Oct;
 * v0.2-draft rows R-M4-13…19 plus the Sinhala/Singlish cue extensions, 24 Oct) are planning
 * artifacts — not approved executable detector logic. This suite therefore pins the behaviour
 * of a DRAFT rule library implementing those hypotheses. Output is "which rules matched +
 * quoted evidence spans" — never a verdict, score, category or incident claim.
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

// ---- v0.2 Sri Lankan adaptation (catalogue amendment 24 Oct 2026): R-M4-13…19 ----
// Each pair below is the exact text of the fixture pair named in its test
// (testing/M4-synthetic-pairs.json, v0.2 pairs M4-SL01…SL10). Sinhala texts pin the
// script-lookbehind and ZWJ behaviour; no language accuracy is claimed anywhere.

const SL01_S = 'Pethfern draw winner: claim your LKR 750,000 prize at https://pethfern-claim.example/win within 48 hours.';
const SL01_L = 'Pethfern draw results are published at https://pethfern.example/results. Winners are notified by the organizer through the contact on your entry; no payment or details are needed to check.';
const SL02_S = 'සුබ පැතුම්! ඔබ Pethfern ලොතරැයියේ ජයග්‍රාහකයෙක්. රු. 750,000 ත්‍යාගයක්. තහවුරු කරන්න: https://pethfern-claim.example/win';
const SL02_L = 'Pethfern ලොතරැයි ප්‍රතිඵල https://pethfern.example/results හි පළවේ. ජයග්‍රාහකයන්ට දැනුම් දෙන්නේ ඔබේ ටිකට්පතේ සඳහන් නිල ක්‍රමවේදය අනුව ය; ගෙවීමක් අවශ්‍ය නොවේ.';
const SL03_S = 'Pethpost parcel notice: your parcel was unsuccessful as the courier attempted delivery. Pay the LKR 99 customs release fee at https://parcel-release.example/pay to get it today.';
const SL03_L = 'Pethpost parcels arrive at your local office; delivery hours are at https://pethpost.example/hours. No customs fee is needed for local parcels, and payment links are never sent by message.';
const SL04_S = 'Pethway Motor Licensing: vehicle WP CAB-4412 has an unpaid traffic fine of LKR 5,500. Pay within 24 hours to avoid court action at https://govpay-fines.example/pay.';
const SL04_L = 'Pethway licensing queries: a traffic fine notice can be checked through the counters listed on the printed notice; payment links are not sent by message and you may dispute it before paying.';
const SL05_S = 'Pethbank alert: a transfer is being made from your account. If this is not you, click the link below to cancel it now: https://pethbank-cancel.example/stop';
const SL05_L = 'If a transfer shown in your banking app was not made by you, call the branch using the number on your card. Do not click links or cancel anything from a message.';
const SL06_S = 'Send LKR 100000 to our crypto desk today — your money is doubled every three months with guaranteed returns. Message our advisor on Telegram to start.';
const SL06_L = 'Our long-term fund doubled in value over the last decade, but investments involve risk and past performance never guarantees returns; read the prospectus through the licensed regulator register before deciding.';
const SL07_S = 'Pethpost parcel held: pay the customs release fee at https://pethpost-release.top/pay within 24 hours. Details: bit.ly/pethpost-info';
const SL07_L = 'Pethpost parcel delivery hours are listed at https://pethpost.example/hours. No customs fee is needed and payments are made only at the post office counter on your receipt.';
const SL08_S = 'Hello, I am a doctor from overseas on charity work. I want to donate to your village; please provide your bank details so the funds reach you this week.';
const SL08_L = 'A charity caller asked for our village hall details. Never provide bank details in an unexpected call; verify the charity through its published contacts before any donation.';
const SL09_S = 'Pethpost parcel held: install the delivery app Pethpost-verify.apk from https://pethpost-update.example/app to release your parcel today.';
const SL09_L = 'Pethpost never sends apps by message. Install updates only from your phone\'s official app store, and no parcel release requires installing anything.';
const SL10_S = 'Oba Pethfern lutharayi jayagrahakayek! Rs 500,000 prize ekai. Karanna: https://pethfern-claim.example/win';
const SL10_L = 'Pethfern lutharayi results are on the official site listed on your ticket. No money requests are made, and winners are notified through the entry contact.';
const SL11_S = 'Rs. 250 000 dakwa Loan ekak labaganna puluwan. Obata avashya mudal sandaha danma apply karanna: https://k9f2.example/NkLX';
const SL11_L = 'Pethbank personal loans up to LKR 5,000,000 are applied for at your branch or through the banking app you already use. Approval is never instant, and no fee is collected before the loan is disbursed.';
const SL12_S = 'Ikmanin LKR 300 000 bank account ekata https://m4x8.example/Tfdx1ih';
const SL12_L = 'Salary credits reach your bank account on the normal pay date, and the bank never asks for details by message. Check any money offer through the branch listed on your card.';

test('review follow-up: disclaimers and no-risk claims never erase an affirmative investment promise', () => {
  for (const disclaimer of [
    'You can lose all your money.',
    'There is no risk of loss.',
    'Past performance never guarantees returns.',
    'No guarantee is offered. Investing involves risk of total loss.',
  ]) {
    for (const pitch of [SL06_S, 'Invest with us: double your money in three days.']) {
      assert.ok(firedIds(`${pitch} ${disclaimer}`).includes('R-M4-17'), disclaimer);
    }
  }
  assert.ok(firedIds('Our investment has no guarantee of performance and we double your money in three days.').includes('R-M4-17'));
  assert.ok(firedIds('Past performance never guarantees returns and our investment doubles your money in three days.').includes('R-M4-17'));
  assert.deepEqual(firedIds(SL06_L), [], 'dated historical growth remains a legitimate control');
});

test('review follow-up: negative investment statements do not become affirmative promises', () => {
  for (const text of [
    'Our investment returns are not guaranteed returns.',
    'This investment is not risk-free.',
    'Our investments do not double your money.',
    'We never promise guaranteed returns on investments.',
  ]) assert.ok(!firedIds(text).includes('R-M4-17'), text);
});

test('review follow-up: historical growth cannot hide a separate current doubling promise', () => {
  const text = 'Our investment doubled in value over the last decade; invest now and your money is doubled over ten years.';
  const match = analyzeRules(text).matches.find((m) => m.ruleId === 'R-M4-17');
  assert.ok(match);
  assert.equal(match.start, text.lastIndexOf('doubled'));
});

test('review follow-up: future-perfect and qualified passive promises are not historical growth', () => {
  for (const text of [
    'Invest now and we guarantee your money will have doubled over ten years.',
    'Invest now and your money will be more than doubled over ten years.',
    'Invest now and expect your money to have doubled over ten years.',
  ]) assert.ok(firedIds(text).includes('R-M4-17'), text);
});

test('review follow-up: domain-shape rules use the hostname, not a URL path, query or username', () => {
  for (const text of [
    'https://www.dialog.lk/help/account.online',
    'https://www.dialog.lk/help/bank-verify-account.com',
    'https://bank.example/info?reference=parcel.top',
    'https://parcel.top@bank.example/help',
    'https://parcel.top.evil.example/help',
  ]) assert.ok(!firedIds(text).includes('R-M4-19'), text);
  for (const text of [
    'https://parcel.top/pay', 'https://bank.example@parcel.top/pay',
    'WWW.PARCEL.ONLINE/pay', 'bank-verify-account.com',
    'https://www.dialog.lk/download/update.apk',
    'update.apk https://www.dialog.lk/help',
    'https://parcel.top/pay https://www.dialog.lk/help',
  ]) {
    const match = analyzeRules(text).matches.find((m) => m.ruleId === 'R-M4-19');
    assert.ok(match, text);
    assert.equal(text.slice(match.start, match.end), match.excerpt);
  }
});

test('R-M4-13: M4-SL01-S (win claimed via message link) fires; M4-SL01-L (results URL) is silent', () => {
  assert.ok(firedIds(SL01_S).includes('R-M4-13'));
  assert.deepEqual(firedIds(SL01_L), []);
});

test('R-M4-13: M4-SL02-S (Sinhala, ZWJ conjuncts) fires; M4-SL02-L is silent', () => {
  assert.ok(firedIds(SL02_S).includes('R-M4-13'));
  assert.deepEqual(firedIds(SL02_L), []);
});

test('Sinhala cue matching works without ZWJ and never matches inside a larger word', () => {
  // ZWJ-optional conjunct: the non-ZWJ spelling ත්යාග (ත ් ය ා ග) still matches.
  const noZwj = 'ඔබ ත්යාගයක් දිනයි. තහවුරු කරන්න: https://peth-claim.example/win';
  assert.ok(firedIds(noZwj).includes('R-M4-13'));
  // Script lookbehind: ජයග්‍රාහක must not match inside a longer Sinhala run.
  const embedded = 'ජයග්‍රාහකත්වය';
  assert.ok(!/ජයග්\u200D?රාහක(?![\u0D80-\u0DFF])/u.test(embedded) || embedded.length === 0);
  assert.deepEqual(firedIds('ජයග්‍රාහකත්වය ප්‍රකාශයකි.'), []);
});

test('R-M4-14: M4-SL03-S (parcel customs fee via link) fires; M4-SL03-L ("no customs fee") is silent', () => {
  assert.ok(firedIds(SL03_S).includes('R-M4-14'));
  assert.deepEqual(firedIds(SL03_L), []);
});

test('R-M4-15: M4-SL04-S (fine under deadline + link) fires; M4-SL04-L (counter verification) is silent', () => {
  assert.ok(firedIds(SL04_S).includes('R-M4-15'));
  assert.deepEqual(firedIds(SL04_L), []);
  // Bare conversational "fine" is not a fine-context cue.
  assert.deepEqual(firedIds('It is fine, pay the difference at the office.'), []);
});

test('R-M4-16: M4-SL05-S (cancel-the-transfer link) fires; M4-SL05-L (call the branch) is silent', () => {
  assert.ok(firedIds(SL05_S).includes('R-M4-16'));
  assert.deepEqual(firedIds(SL05_L), []);
});

test('R-M4-17: M4-SL06-S (doubling claim) fires; M4-SL06-L (dated historical growth) is silent', () => {
  assert.ok(firedIds(SL06_S).includes('R-M4-17'));
  assert.deepEqual(firedIds(SL06_L), []);
  // Investment mention without a doubling claim stays silent (grooming first contact).
  assert.deepEqual(firedIds('I invest in USDT and can show you how to earn too.'), []);
});

test('review #5: an appended one-line risk disclaimer no longer silences a doubling pitch', () => {
  const withDisclaimer = SL06_S + ' Note: investments involve risk.';
  assert.ok(firedIds(withDisclaimer).includes('R-M4-17'), 'a copied disclaimer line must not launder the pitch');
  // Dated historical growth stays silent independently of the appended disclaimer.
  assert.deepEqual(
    firedIds('Investing in our bond fund: returns have doubled over ten years, but there is no guarantee — you can lose all your money.'),
    [],
  );
});

test('R-M4-18/19: M4-SL07-S fires the shape flags with R-M4-14; M4-SL07-L is silent', () => {
  const fired = firedIds(SL07_S);
  for (const id of ['R-M4-14', 'R-M4-18', 'R-M4-19']) assert.ok(fired.includes(id), `${id} must fire on SL07-S`);
  assert.deepEqual(firedIds(SL07_L), []);
});

test('review #2: an official link in the same message can no longer hide a suspicious link', () => {
  const laundering = 'Parcel fee at https://pethpost-release.top/pay — official info at https://payment.ceb.lk/instantpay';
  assert.ok(firedIds(laundering).includes('R-M4-19'), 'one official link must not suppress the abuse-TLD flag');
  // Official URLs themselves never match the shape regex by construction (other evidence
  // rules may still comment on surrounding wording — that is their job, not the allowlist's).
  assert.ok(!firedIds('Pay your CEB bill at https://payment.ceb.lk/instantpay.').includes('R-M4-19'));
  assert.ok(!firedIds('Register via REG SMS to 1987 or https://payment.ceb.lk. No fee is needed.').includes('R-M4-19'));
});

test('review #6: the Sinhala investment token matches composed and decomposed spellings, never nonsense', () => {
  // Composed ආයෝජන (U+0D86 U+0DBA U+0DDD U+0DA2 U+0DB1) + දෙගුණ (double).
  const composed = 'ආයෝජනය අදම ආරම්භ කරන්න. ඔබේ මුදල් දෙගුණ වේ.';
  assert.ok(firedIds(composed).includes('R-M4-17'), 'the correctly spelled ආයෝජන must match');
  // Decomposed vowel sign (ෙ U+0DD9 + ා U+0DCF instead of precomposed ෝ U+0DDD).
  const decomposed = '\u0D86\u0DBA\u0DD9\u0DCF\u0DA2\u0DB1 කරන්න. මුදල් දෙගුණ වේ.';
  assert.ok(firedIds(decomposed).includes('R-M4-17'), 'the decomposed spelling must match too');
  // The old bug: the nonsense string ආෝජන (vowel sign directly after ආ) must NOT match.
  assert.deepEqual(firedIds('\u0D86\u0DDD\u0DA2\u0DB1 දෙගුණ'), []);
  // Variant spelling ආයොජන (documented in the corpus) matches as well.
  assert.ok(firedIds('ආයොජන අවස්ථාව. මුදල් දෙගුණ කරනු ලැබේ.').includes('R-M4-17'));
});

test('R-M4-19: M4-SL09-S (.apk push) fires; M4-SL09-L (official store) is silent', () => {
  assert.ok(firedIds(SL09_S).includes('R-M4-19'));
  assert.deepEqual(firedIds(SL09_L), []);
});

test('R-M4-02 extensions: M4-SL08-S (bank details ask) fires; M4-SL08-L is silent', () => {
  assert.ok(firedIds(SL08_S).includes('R-M4-02'));
  assert.deepEqual(firedIds(SL08_L), []);
  // A bare conditional describing the scammer's ask is a warning, not a demand.
  assert.deepEqual(firedIds('If asked for your OTP, never share it.'), []);
});

test('Singlish starter set: M4-SL10-S fires R-M4-13; M4-SL10-L is silent', () => {
  assert.ok(firedIds(SL10_S).includes('R-M4-13'));
  assert.deepEqual(firedIds(SL10_L), []);
});

test('R-M4-20: M4-SL11-S (Singlish instant loan + link) fires; M4-SL11-L (branch application) is silent', () => {
  assert.ok(firedIds(SL11_S).includes('R-M4-20'));
  assert.deepEqual(firedIds(SL11_L), []);
  // The documented research funnel shape fires too, via its approval-speed wording.
  const funnel = 'Loan Alert: You are eligible for a personal loan up to LKR 2,000,000. No collateral needed. Approval in 30 minutes. Apply now: https://loans-lk.example/apply';
  assert.ok(firedIds(funnel).includes('R-M4-20'));
});

test('R-M4-20: M4-SL12-S (instant money without a loan word) fires; M4-SL12-L is silent', () => {
  assert.ok(firedIds(SL12_S).includes('R-M4-20'));
  assert.deepEqual(firedIds(SL12_L), []);
  // Loan/amount without a message link is ordinary bank communication, not evidence.
  assert.deepEqual(firedIds('Pethbank personal loans up to LKR 5,000,000 are applied for at your branch or through the banking app you already use.'), []);
});

test('every v0.2 excerpt is a literal substring of its submitted text', () => {
  for (const text of [SL01_S, SL02_S, SL03_S, SL04_S, SL05_S, SL06_S, SL07_S, SL08_S, SL09_S, SL10_S]) {
    for (const m of analyzeRules(text).matches) {
      assert.ok(text.includes(m.excerpt), `excerpt "${m.excerpt}" must appear verbatim`);
    }
  }
});

// ---- R-M4-11 stub: explicit display/target metadata only (shortener/threshold OPEN) ----

test('review hardening: shortener hosts match without paths, but never inside unrelated URLs or email addresses', () => {
  for (const text of ['bit.ly', 'Visit bit.ly.', 'https://bit.ly?x=1', 'https://BIT.LY#offer', '(bit.ly/abc)', 'www.tinyurl.com/abc']) {
    assert.ok(firedIds(text).includes('R-M4-18'), text);
  }
  for (const text of ['notbit.ly/abc', 'https://bit.ly.example/abc', 'https://example.com/bit.ly/abc',
    'user@bit.ly/abc', 'https://bit.ly@ordinary.example/path', 'https://example.com/?next=bit.ly/abc',
    'https://example.com/#bit.ly/abc', 'https://example.com/path(bit.ly/abc)']) {
    assert.ok(!firedIds(text).includes('R-M4-18'), text);
  }
});

test('review hardening: loan amounts stay on one line and preserve grouped currency amounts', () => {
  for (const gap of ['\n', '\r\n', '\n\n\n\n']) {
    const text = `Instant loan: LKR${gap}5,000 at https://lender.example/apply`;
    assert.ok(!firedIds(text).includes('R-M4-20'), JSON.stringify(text));
  }
  for (const amount of ['LKR 5,000', 'Rs. 250 000', 'LKR\t300 000', 'LKR 2,000,000', 'LKR 5000.50', '300000']) {
    assert.ok(firedIds(`Instant loan ${amount} at https://lender.example/apply`).includes('R-M4-20'), amount);
  }
});

test('review follow-up: complete email and Unicode hostname tokens cannot be truncated into shorteners', () => {
  for (const text of ['bit.ly+tag@example.com', 'bit.ly+tag@bit.ly', 'bit.ly.例子.com/abc',
    'user+bit.ly@example.com', 'කbit.ly/abc', 'bit.ly+suffix', 'bit.ly%2eexample.com/abc']) {
    assert.ok(!firedIds(text).includes('R-M4-18'), text);
  }
  for (const text of ['bit.ly/abc?email=user@example.com', 'https://user@bit.ly/abc']) {
    const match = analyzeRules(text).matches.find((m) => m.ruleId === 'R-M4-18');
    assert.ok(match, text);
    assert.equal(text.slice(match.start, match.end), match.excerpt);
  }
});

test('review coverage: ask-for demands match nearby secrets, not ordinary requests or prohibitions', () => {
  for (const text of ['Mark asked for your password to restore the account', 'The agent is asking for your OTP']) {
    assert.ok(firedIds(text).includes('R-M4-02'), text);
  }
  for (const text of ['She asked for directions and he walked her home', 'Never ask for your password', 'If asked for your OTP, never share it.']) {
    assert.deepEqual(firedIds(text), [], text);
  }
});

test('review coverage: generic hyphenated host shapes are evidence only, not proof of impersonation', () => {
  const result = analyzeRules('Track your parcel at https://my-pay-later.com/track');
  assert.deepEqual(result.matches.map((match) => match.ruleId), ['R-M4-19']);
  assert.equal(result.matches[0].contextNote, 'hostile-link-shape');
  assert.ok(!('verdict' in result.matches[0]));
  assert.deepEqual(firedIds('Read https://login-support.open.ac.uk/x'), []);
});

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
  for (const text of [PH01_S, PH02_S, PH03_S, RO01_S, IN01_S, IN02_S, PR01_S, PR02_S, PR05_S, OT01_S, OT05_S, SL01_S, SL02_S, SL03_S, SL04_S, SL05_S, SL06_S, SL07_S, SL08_S, SL09_S, SL10_S, SL11_S, SL12_S]) {
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

test('contract: matches carry evidence and offsets, with no verdict/score/category field', () => {
  const r = analyzeRules(PH01_S);
  assert.deepEqual(Object.keys(r), ['matches']);
  for (const m of r.matches) {
    const keys = Object.keys(m);
    assert.ok(keys.includes('ruleId') && keys.includes('excerpt'));
    for (const k of keys) assert.ok(['ruleId', 'excerpt', 'contextNote', 'start', 'end'].includes(k), `unexpected field ${k}`);
    assert.ok(typeof m.ruleId === 'string' && m.ruleId.startsWith('R-M4-'));
    assert.ok(typeof m.excerpt === 'string' && m.excerpt.length > 0);
  }
});

test('negation applies to the requested action, not unrelated reassurance or verification', () => {
  for (const text of [
    'No problem send your password now.',
    'There is no need to call support before you send your password now.',
    'Do not call support but send your password now.',
    'I cannot access my account so send your password now.',
  ]) assert.ok(firedIds(text).includes('R-M4-02'), text);
  for (const text of [
    'Do not send your password now.',
    'Never share your OTP.',
    'This is not a place to enter your password.',
    'We do not need your password.',
    'There is no need to send your password.',
  ]) assert.deepEqual(firedIds(text), [], text);
});

test('a prohibited secret cannot be paired with an instruction after a contrast', () => {
  assert.deepEqual(firedIds('Do not send your password but send the parcel today.'), []);
  const text = 'Do not send your password but do send your OTP.';
  const match = analyzeRules(text).matches.find((m) => m.ruleId === 'R-M4-02');
  assert.ok(match);
  assert.equal(match.excerpt, 'OTP');
  assert.equal(match.start, text.indexOf('OTP'));
});

test('an explicitly ignored supplier record does not suppress an invoice demand', () => {
  const ids = firedIds('Invoice FI-300: pay LKR 5000 now and ignore the existing supplier record.');
  assert.ok(ids.includes('R-M4-05'));
  assert.ok(ids.includes('R-M4-06'));
});

test('an inability to video call does not negate a separate romance money request', () => {
  assert.ok(firedIds('I cannot video call so send LKR 48000 now my darling.').includes('R-M4-04'));
});

test('depositing an employer cheque is not an upfront job-fee request', () => {
  assert.ok(!firedIds(OT05_S).includes('R-M4-09'));
});

test('unrelated topics cannot supply prize context or suppress an invoice demand', () => {
  assert.deepEqual(firedIds('The raffle prize is a book. Separately, pay the parking fee at the council office.'), []);
  assert.ok(firedIds('Invoice FI-900: pay LKR 9500 now for a listing you never ordered. Independently, the library opens at noon.').includes('R-M4-05'));
});

test('evidence identifies the actual matching occurrence, including UTF-16 offsets', () => {
  const text = '😀 Your password should stay secret. Send your OTP now.';
  const match = analyzeRules(text).matches.find((m) => m.ruleId === 'R-M4-02');
  assert.ok(match);
  assert.equal(match.excerpt, 'OTP');
  assert.equal(match.start, text.indexOf('OTP'));
  assert.equal(match.end, text.indexOf('OTP') + 3);
  assert.equal(text.slice(match.start, match.end), match.excerpt);
});

test('documented wording variants cover romance requests without firing on their warnings', () => {
  const pairs = [
    ['Darling, we have only chatted online. Please send LKR 35000 to my agent. Do not call the hospital.', 'Darling, do not send LKR 35000 to my agent. Please call the hospital.'],
    ['Our online romance is real. Pay my visa release fee to this new agent today. The embassy cannot discuss it.', 'Our online romance is real. Do not pay my visa release fee to an agent.'],
    ['Sweetheart, I cannot meet. Buy a gift card and send its redemption code to prove you care.', 'Sweetheart, do not buy a gift card or send its redemption code.'],
    ['We will meet after months of online dating if you wire my ticket money today. I cannot join a call.', 'After months of online dating, do not wire ticket money to anyone.'],
  ];
  for (const [suspicious, warning] of pairs) {
    assert.ok(firedIds(suspicious).includes('R-M4-04'), suspicious);
    assert.ok(!firedIds(warning).includes('R-M4-04'), warning);
  }
});

test('financial and employment variants remain rules, not verdicts', () => {
  const cases = [
    ['Unlock delivery by entering your card PIN at HTTPS://parcel.example/x.', 'R-M4-03'],
    ['Voucher winner: enter your card number and security code to claim your gift.', 'R-M4-08'],
    ['Earn weekly for home work. Send a starter-kit deposit to unlock guaranteed tasks.', 'R-M4-09'],
    ['We send a cheque for equipment. Keep your fee and buy gift cards for the rest.', 'R-M4-10'],
  ];
  for (const [text, id] of cases) assert.ok(firedIds(text).includes(id), text);
});

test('a later inability to confirm a prize does not negate its requested reservation fee', () => {
  assert.ok(firedIds('Prize desk: reserve your bicycle by transferring LKR 4000 to our wallet now. We cannot confirm your entry until the reservation fee arrives.').includes('R-M4-07'));
});

test('a conditional question about an amount due is not an invoice payment demand', () => {
  assert.deepEqual(firedIds('An invoice review may be needed. Verify the account and order through your existing desk contact before deciding whether anything is due.'), []);
});

test('rule analysis and display-target checks never fetch a destination', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls += 1; throw new Error('Unexpected destination fetch'); }) as typeof fetch;
  try {
    assert.ok(analyzeRules(PH01_S).matches.length > 0);
    const target = 'https://other.example/login';
    const [match] = checkDisplayTarget('https://bank.example/login', target);
    assert.equal(target.slice(match.start, match.end), match.excerpt);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
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
