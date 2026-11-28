import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOrganizationContacts } from './organization-verification.ts';
import type { OrganizationRecord } from './organization-directory.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';

const NOW = Date.UTC(2026, 9, 26, 6);
const source = { url: 'https://official.example/contact', title: 'Official contact directory', reviewedAt: '2026-10-26', context: 'Sri Lanka head office' };
const DIRECTORY: readonly OrganizationRecord[] = [
  { id: 'sampath', name: 'Sampath Bank', kind: 'bank', aliases: ['Sampath Bank'], country: 'LK',
    identity: { description: 'Listed as a licensed commercial bank.', source },
    domains: [{ value: 'sampath.lk', includeSubdomains: true, source }],
    phones: [{ value: '+94112300260', scope: 'Sri Lanka head office', source }] },
  { id: 'peoples', name: 'People’s Bank', kind: 'bank', aliases: ['People’s Bank', "People's Bank"], country: 'LK',
    identity: { description: 'Listed as a licensed commercial bank.', source },
    domains: [{ value: 'peoplesbank.lk', includeSubdomains: false, source }],
    phones: [{ value: '1961', scope: 'Sri Lanka call centre', source }] },
];

test('Sampath alert confirms directory identity but never invents the example phone match', () => {
  const result = verifyOrganizationContacts('Sampath Bank Alert: LKR 5,000.00 has been debited from your account ending 9074 on 26/10/2026 09:30. Total account balance is LKR 128,400.00. Contact us immediately on 0112303050', DIRECTORY, NOW);
  assert.equal(result.organizations.length, 1);
  assert.equal(result.organizations[0].identity.status, 'matched');
  assert.equal(result.organizations[0].contacts.find(item => item.kind === 'phone')?.status, 'not-confirmed');
  assert.equal(result.organizations[0].contacts.find(item => item.kind === 'website')?.status, 'not-provided');
});

test('Sri Lankan domestic, international and formatted phone equivalents match', () => {
  for (const phone of ['0112300260', '+94 11 230 0260', '0094 11 230 0260', '(011) 230-0260']) {
    const result = verifyOrganizationContacts(`Sampath Bank: call ${phone}`, DIRECTORY, NOW);
    assert.equal(result.organizations[0].contacts.find(item => item.kind === 'phone')?.status, 'matched', phone);
  }
});

test('verified short codes require contact context and are not arbitrary OTP matches', () => {
  const contact = verifyOrganizationContacts("People's Bank: call 1961", DIRECTORY, NOW);
  assert.equal(contact.organizations[0].contacts.find(item => item.kind === 'phone')?.status, 'matched');
  const otp = verifyOrganizationContacts("People's Bank: Your OTP is 1961.", DIRECTORY, NOW);
  assert.equal(otp.organizations[0].contacts.find(item => item.kind === 'phone')?.status, 'not-provided');
});

test('hostname parsing prevents deceptive suffixes, userinfo, lookalikes and path-based matches', () => {
  for (const url of ['https://sampath.lk.evil.example/pay', 'https://sampath.lk@evil.example', 'https://evil.example/sampath.lk', 'https://sаmpath.lk', 'https://evil.example/?next=https://sampath.lk']) {
    const result = verifyOrganizationContacts(`Sampath Bank: ${url}`, DIRECTORY, NOW);
    assert.equal(result.organizations[0].contacts.filter(item => item.kind === 'website').every(item => item.status === 'not-confirmed'), true, url);
  }
});

test('exact and approved subdomains match, including bare domains and domain-only identification', () => {
  for (const domain of ['https://sampath.lk', 'https://www.sampath.lk/help', 'sampath.lk', 'https://SAMPATH.LK./']) {
    const result = verifyOrganizationContacts(`Check ${domain}`, DIRECTORY, NOW);
    assert.equal(result.organizations[0].identifiedBy, 'domain');
    assert.equal(result.organizations[0].contacts[0].status, 'matched');
  }
  const exactOnly = verifyOrganizationContacts("People's Bank: https://login.peoplesbank.lk", DIRECTORY, NOW);
  assert.equal(exactOnly.organizations[0].contacts[0].status, 'not-confirmed');
});

test('several named organizations and another organization’s contacts remain separate', () => {
  const result = verifyOrganizationContacts("Sampath Bank and People's Bank: call 0112300260 or visit peoplesbank.lk", DIRECTORY, NOW);
  assert.equal(result.organizations.length, 2);
  const sampathWebsite = result.organizations[0].contacts.find(item => item.kind === 'website');
  assert.equal(sampathWebsite?.status, 'another-organization');
  assert.equal(sampathWebsite?.matches[0].organizationName, 'People’s Bank');
  assert.equal(result.organizations[1].contacts.find(item => item.kind === 'phone')?.status, 'another-organization');
});

test('unknown organizations and missing contacts stay unverified without asserting fraud', () => {
  const unknown = verifyOrganizationContacts('Example Delivery: call +12025550101 or visit example.invalid', DIRECTORY, NOW);
  assert.equal(unknown.organizations.length, 0);
  assert.equal(unknown.unmatchedContacts.length, 2);
  assert.ok(unknown.unmatchedContacts.every(item => item.status === 'not-confirmed'));
  const empty = verifyOrganizationContacts('Reminder: the lab is at 3pm.', DIRECTORY, NOW);
  assert.equal(empty.organizations.length, 0);
  assert.equal(empty.unmatchedContacts.length, 2);
  assert.ok(empty.unmatchedContacts.every(item => item.status === 'not-provided'));
});

test('facts older than 90 days, future-dated or invalid review dates never claim a current match', () => {
  for (const reviewedAt of ['2026-07-27', '2026-10-27', 'invalid']) {
    const staleSource = { ...source, reviewedAt };
    const stale = [{ ...DIRECTORY[0], identity: { ...DIRECTORY[0].identity, source: staleSource },
      domains: [{ ...DIRECTORY[0].domains[0], source: staleSource }] }];
    const result = verifyOrganizationContacts('Sampath Bank: sampath.lk', stale, NOW);
    assert.equal(result.organizations[0].identity.status, 'outdated');
    assert.equal(result.organizations[0].contacts[0].status, 'outdated');
  }
});

test('matching identity and contact data never sets a risk band or sender authentication', () => {
  const result = verifyOrganizationContacts('Sampath Bank: call 0112300260, then send your password and OTP to us immediately.', DIRECTORY, NOW);
  assert.equal(result.organizations[0].contacts[0].status, 'matched');
  assert.equal('riskLevel' in result, false);
  assert.equal('senderAuthenticated' in result, false);
  assert.match(result.notice, /does not authenticate the sender/);
});

test('email addresses and URL fragments do not become independent website evidence', () => {
  const result = verifyOrganizationContacts('Sampath Bank: email agent@sampath.lk or see https://evil.example/sampath.lk', DIRECTORY, NOW);
  assert.equal(result.organizations[0].contacts.filter(item => item.kind === 'website').length, 1);
  assert.equal(result.organizations[0].contacts[0].status, 'not-confirmed');
});

test('bare URL queries, fragments and non-HTTP schemes cannot manufacture trusted domains', () => {
  for (const value of ['evil.example?next=sampath.lk', 'evil.example#sampath.lk', 'ftp://evil.example/?next=sampath.lk',
    'ftp://evil.example/?next=https://sampath.lk', 'custom://evil.example/#www.sampath.lk',
    'javascript:sampath.lk', 'data:text/plain,sampath.lk', 'evil.example?next=https://sampath.lk',
    'evil.example/#www.sampath.lk', 'www.evil.example?next=https://sampath.lk']) {
    const result = verifyOrganizationContacts(`Sampath Bank: ${value}`, DIRECTORY, NOW);
    assert.equal(result.organizations[0].contacts.some(item => item.status === 'matched'), false, value);
  }
});

test('short codes cannot match prefixes of dates, decimals, addresses or longer words', () => {
  for (const value of ['contact 1961-10-26', 'call 1961.123456', 'phone 1961@evil.example', 'contact 1961x']) {
    const result = verifyOrganizationContacts(`People's Bank: ${value}`, DIRECTORY, NOW);
    assert.equal(result.organizations[0].contacts.some(item => item.status === 'matched'), false, value);
  }
});

test('a message mentioning an organization gets reference contacts even without submitted contacts', () => {
  const result = verifyOrganizationContacts('My friend said Sampath Bank has changed its opening hours.', DIRECTORY, NOW);
  const org = result.organizations[0];
  assert.equal(org.identifiedBy, 'name');
  assert.ok(org.contacts.every(contact => contact.status === 'not-provided'));
  assert.deepEqual(org.officialContacts, [
    { kind: 'website', value: 'sampath.lk', scope: 'Reviewed website hostname', status: 'matched', source },
    { kind: 'phone', value: '+94112300260', scope: 'Sri Lanka head office', status: 'matched', source },
  ]);
});

test('an unconfirmed submitted number does not replace the official reference number', () => {
  const org = verifyOrganizationContacts('Sampath Bank: call 0112303050', DIRECTORY, NOW).organizations[0];
  assert.equal(org.contacts.find(contact => contact.kind === 'phone')?.status, 'not-confirmed');
  assert.equal(org.officialContacts.find(contact => contact.kind === 'phone')?.value, '+94112300260');
  assert.equal(org.officialContacts.some(contact => contact.value === '0112303050'), false);
});

test('a listed phone number can identify a related organization without claiming a sender', () => {
  for (const number of ['0112300260', '+94 11 230 0260', '0094 11 230 0260', '(011) 230-0260']) {
    const result = verifyOrganizationContacts(`My friend suggested I contact ${number} about the account.`, DIRECTORY, NOW);
    assert.equal(result.organizations[0]?.id, 'sampath', number);
    assert.equal(result.organizations[0]?.identifiedBy, 'phone', number);
    assert.match(result.notice, /does not authenticate the sender/);
  }
  assert.equal(verifyOrganizationContacts('For help call 1961', DIRECTORY, NOW).organizations[0]?.id, 'peoples');
  assert.equal(verifyOrganizationContacts('Your OTP is 1961.', DIRECTORY, NOW).organizations.length, 0);
});

test('reference contacts preserve individual freshness, scope and absent phone coverage', () => {
  const staleSource = { ...source, reviewedAt: '2026-01-01' };
  const directory = [{ ...DIRECTORY[0], phones: [{ ...DIRECTORY[0].phones[0], source: staleSource }] }];
  const org = verifyOrganizationContacts('Sampath Bank opening hours?', directory, NOW).organizations[0];
  assert.equal(org.identity.status, 'matched');
  assert.equal(org.officialContacts.find(contact => contact.kind === 'website')?.status, 'matched');
  assert.equal(org.officialContacts.find(contact => contact.kind === 'phone')?.status, 'outdated');
  const noPhone = verifyOrganizationContacts('Sampath Bank opening hours?', [{ ...DIRECTORY[0], phones: [] }], NOW);
  assert.ok(noPhone.organizations[0].officialContacts.every(contact => contact.kind === 'website'));
});

test('generic messages do not guess an organization or invent reference contacts', () => {
  for (const text of ['Your bank account has been debited.', 'Your parcel is ready. Call +12025550101.', 'A friend mentioned Example Bank.']) {
    assert.equal(verifyOrganizationContacts(text, DIRECTORY, NOW).organizations.length, 0);
  }
});

test('whole bare-host tokens containing symbols, underscores or marks never identify an official substring', () => {
  for (const host of ['💩sampath.lk', 'sampath.lk💩', 'evil_sampath.lk', 'sampath.lk_foo',
    '\u0301sampath.lk', 'sampath.lk\u0301', '💩www.peoplesbank.lk', 'www.peoplesbank.lk💩']) {
    const result = verifyOrganizationContacts(host, DIRECTORY, NOW);
    assert.equal(result.organizations.length, 0, host);
    assert.equal(result.unmatchedContacts.some(contact => contact.status === 'matched'), false, host);
  }
});

test('whole-host tokenization preserves sentence punctuation, ordinary phone contacts and email boundaries', () => {
  for (const text of ['Visit sampath.lk.', 'Check (sampath.lk), please.', 'See [sampath.lk]; then stop.',
    'Visit “sampath.lk” or «sampath.lk».']) {
    assert.equal(verifyOrganizationContacts(text, DIRECTORY, NOW).organizations[0]?.id, 'sampath', text);
  }
  for (const text of ['person@sampath.lk', 'α@sampath.lk', 'sampath.lk@evil.example',
    'evil.example?next=sampath.lk', 'evil.example?next=https://sampath.lk']) {
    assert.equal(verifyOrganizationContacts(text, DIRECTORY, NOW).organizations.length, 0, text);
  }
  const phone = verifyOrganizationContacts('Please call (011) 230-0260, or use sampath.lk.', DIRECTORY, NOW);
  assert.equal(phone.organizations[0]?.contacts.find(contact => contact.kind === 'phone')?.status, 'matched');
  assert.equal(phone.organizations[0]?.contacts.find(contact => contact.kind === 'website')?.status, 'matched');
});

// A genuine CEB bill pays at payment.ceb.lk, which CEB's own homepage links as "BILL PAYMENT".
// While the host was unlisted the model escalated the same bill to "suspicious" in English and
// Sinhala (language sign-off B2/B3), because verification honestly reported the host as
// unconfirmed. These assertions pin the reviewed fact and, beside it, that a look-alike host
// still is not confirmed.
test('a genuine CEB bill confirms the official payment host, and only that host', () => {
  const later = Date.UTC(2026, 10, 27, 6); // after the 26 Nov billing-link review
  const bill = 'CEB: bill for account 00XXXXX is Rs. 4,320, due 4 November. Payment is only at payment.ceb.lk or the post office.';
  const matched = verifyOrganizationContacts(bill, ORGANIZATION_DIRECTORY, later);
  const ceb = matched.organizations.find(item => item.id === 'ceb');
  if (!ceb) throw new Error('CEB must be identified in the bill');
  const website = ceb.contacts.find(item => item.kind === 'website');
  assert.equal(website?.status, 'matched');
  assert.equal(website?.matches[0]?.organizationId, 'ceb');

  const lookalike = verifyOrganizationContacts(
    'CEB: pay at https://payment.ceb.lk.secure-pay.example/ and send the receipt.',
    ORGANIZATION_DIRECTORY,
    later,
  );
  const spoofed = lookalike.organizations.find(item => item.id === 'ceb');
  assert.equal(spoofed?.contacts.find(item => item.kind === 'website')?.status, 'not-confirmed');
});

// The bill-alert flow says "text REG ... to 1987"; the contact page lists 1987 as the 24/7 call
// centre. Recording the number lets the directory state who owns it, while the short-code guard
// still decides whether a given message's number counts as a contact match.
test('CEB 1987 is a recorded contact, matched only with contact wording', () => {
  const later = Date.UTC(2026, 10, 27, 6);
  const call = verifyOrganizationContacts('CEB: call 1987 about your bill', ORGANIZATION_DIRECTORY, later);
  const ceb = call.organizations.find(item => item.id === 'ceb');
  if (!ceb) throw new Error('CEB must be identified');
  assert.equal(ceb.contacts.find(item => item.kind === 'phone')?.status, 'matched');
  assert.ok(ceb.officialContacts.some(item => item.value === '1987' && item.scope.includes('Call centre')));

  // The guard is unchanged: a bare four-digit sequence in an OTP-style sentence is not a contact.
  const otp = verifyOrganizationContacts('CEB: your OTP is 1987', ORGANIZATION_DIRECTORY, later);
  const otpCeb = otp.organizations.find(item => item.id === 'ceb');
  assert.equal(otpCeb?.contacts.find(item => item.kind === 'phone')?.status, 'not-provided');

  // And the bill's own phrasing is honest about the limit: "to 1987" is not contact wording, so the
  // record lists the number but the message's mention is not asserted as a match.
  const bill = verifyOrganizationContacts(
    'CEB: bill for account 00XXXXX is Rs. 4,320. Register with REG 00XXXXX to 1987 for bill alerts.',
    ORGANIZATION_DIRECTORY,
    later,
  );
  const billCeb = bill.organizations.find(item => item.id === 'ceb');
  assert.equal(billCeb?.contacts.find(item => item.kind === 'phone')?.status, 'not-provided');
  assert.ok(billCeb?.officialContacts.some(item => item.value === '1987'));
});
