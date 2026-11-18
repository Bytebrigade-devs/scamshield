/**
 * Reviewed organization facts, not a sender-authentication or safety allowlist.
 * Contacts are intentionally incomplete. Missing contacts remain unverified.
 * Every hostname is explicit: unreviewed subdomains and tenant hosting are not trusted.
 */
export interface EvidenceSource {
  url: string;
  title: string;
  reviewedAt: string;
  context: string;
}

export type OrganizationKind = 'bank' | 'payment' | 'delivery' | 'technology' | 'utility';

export interface OrganizationRecord {
  id: string;
  name: string;
  kind: OrganizationKind;
  aliases: readonly string[];
  country: string;
  identity: { description: string; source: EvidenceSource };
  domains: readonly { value: string; includeSubdomains: boolean; source: EvidenceSource }[];
  phones: readonly { value: string; scope: string; country?: string; source: EvidenceSource }[];
}

const REVIEWED_AT = '2026-10-26';

function source(url: string, title: string, context: string): EvidenceSource {
  return { url, title, reviewedAt: REVIEWED_AT, context };
}

function hosts(values: readonly string[], evidence: EvidenceSource): OrganizationRecord['domains'] {
  return values.map((value) => ({ value, includeSubdomains: false, source: evidence }));
}

const BANK_REGISTER = source(
  'https://www.cbsl.gov.lk/en/node/2931',
  'Central Bank of Sri Lanka — Licensed Commercial Banks',
  'Register as at 31 May 2026; names, official websites and selected head-office contacts. Not an exhaustive contact list.',
);
const PEOPLES_CONTACT = source(
  'https://www.peoplesbank.lk/contact-us/',
  "People’s Bank — Contact us",
  'Contact General Number lists the domestic call centre, overseas hotline and head-office numbers.',
);
const DHL_SECURITY = source(
  'https://www.dhl.com/lk-en/home/footer/fraud-awareness.html',
  'DHL Sri Lanka — Fraud awareness',
  'Lists examples of official communication websites; also warns that legitimate domains and sender details can be spoofed.',
);
const DHL_LK_GUIDE = source(
  'https://mydhl.express.dhl/content/dam/downloads/lk/en/rate-guide/service_and_rate_guide_lk_en_2026.pdf.coredownload.pdf',
  'DHL Express — Sri Lanka Service & Rate Guide 2026',
  'Dear Customer, page 4: MyDHL website and Sri Lanka customer-service telephone.',
);
const FEDEX_CONTACT = source(
  'https://www.fedex.com/en-lk/customer-support.html',
  'FedEx Sri Lanka — Customer support',
  'FedEx identifies Advantis Express as its nominated Sri Lanka service contractor and supplies an export/import contact number.',
);
const PAYPAL_SECURITY = source(
  'https://www.paypal.com/us/security/learn-about-fake-messages',
  'PayPal US — How to identify fake messages',
  'Official PayPal site and US customer-service number; warns that caller ID does not authenticate a caller.',
);
const MICROSOFT_SUPPORT = source(
  'https://learn.microsoft.com/en-us/troubleshoot/azure/general/email-domains-support-agent',
  'Microsoft Learn — How to determine if an email from Microsoft support is genuine',
  'Updated 25 March 2026; identifies Microsoft support domains and links to official phishing guidance. Email-specific rules do not authenticate pasted messages.',
);
const GOOGLE_SECURITY = source(
  'https://support.google.com/adsense/answer/12062038?hl=en',
  'Google AdSense Help — Suspicious emails or calls claiming to be from Google AdSense',
  'Identifies google.com and links to Google account sign-in and support. This product guidance is not an exhaustive Google domain list.',
);
const GOOGLE_ACCOUNT_SECURITY = source(
  'https://support.google.com/mail/answer/8253?hl=en',
  'Gmail Help — Avoid & report phishing emails',
  'Directs users to myaccount.google.com/notifications to review apparent Google security alerts.',
);
const APPLE_CONTACT = source(
  'https://www.apple.com/contact/',
  'Apple — Contacting Apple',
  'Official contact page with US sales and corporate numbers, and links to Apple account, support and iCloud services.',
);
const AMAZON_CORPORATE = source(
  'https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-First-Quarter-Results/',
  'Amazon.com, Inc. — First Quarter Results 2026',
  '29 April 2026 corporate release identifies Amazon.com, Inc. and points to amazon.com/about and its investor-relations website.',
);
const AMAZON_PAY_SECURITY = source(
  'https://pay.amazon.com/help/201754760',
  'Amazon Pay — Internet scams and phishing',
  'Identifies pay.amazon.com, payments.amazon.com and authorize.payments.amazon.com as Amazon Pay websites; does not authenticate a transaction or message.',
);

// Reviewed 29 October: CEB's transition notice links edl.lk; EDL publishes these contacts/links.
const EDL_CONTACT: EvidenceSource = {
  url: 'https://edl.lk/contact', title: 'Electricity Distribution Lanka — Contact Us', reviewedAt: '2026-10-29',
  context: 'Official EDL contact page lists the 24/7 1987 call centre and +94 11 232 3232 head-office number.',
};
const EDL_HOME: EvidenceSource = {
  url: 'https://edl.lk/', title: 'Electricity Distribution Lanka — Official website', reviewedAt: '2026-10-29',
  context: 'Names Electricity Distribution Lanka (Private) Limited and links to its EDLCare self-service portal. CEB links this successor at https://ceb.lk/commercial_tariff/en/.',
};
const EDL_BALANCE: EvidenceSource = {
  url: 'https://edl.lk/services/existing-customer/check-your-balance', title: 'Electricity Distribution Lanka — Check your balance', reviewedAt: '2026-10-29',
  context: 'Official EDL service page explicitly links to myedlpay.edl.lk. It does not verify message-specific bill paths.',
};

export const ORGANIZATION_DIRECTORY: readonly OrganizationRecord[] = [
  {
    id: 'sampath-bank',
    kind: 'bank',
    name: 'Sampath Bank PLC',
    aliases: ['Sampath Bank PLC', 'Sampath Bank', 'Sampath Vishwa'],
    country: 'LK',
    identity: { description: 'Listed as a Sri Lankan licensed commercial bank in the CBSL register as at 31 May 2026.', source: BANK_REGISTER },
    domains: hosts(['sampath.lk', 'www.sampath.lk'], BANK_REGISTER),
    phones: [
      { value: '+94114730630', scope: 'Sri Lanka head office, CBSL listing', source: BANK_REGISTER },
      { value: '+94112300260', scope: 'Sri Lanka head office, CBSL listing', source: BANK_REGISTER },
    ],
  },
  {
    id: 'bank-of-ceylon',
    kind: 'bank',
    name: 'Bank of Ceylon',
    aliases: ['Bank of Ceylon', 'BOC'],
    country: 'LK',
    identity: { description: 'Listed as a Sri Lankan licensed commercial bank in the CBSL register as at 31 May 2026.', source: BANK_REGISTER },
    domains: hosts(['boc.lk', 'www.boc.lk'], BANK_REGISTER),
    phones: [{ value: '+94112446790', scope: 'Sri Lanka head office, CBSL listing', source: BANK_REGISTER }],
  },
  {
    id: 'commercial-bank',
    kind: 'bank',
    name: 'Commercial Bank of Ceylon PLC',
    aliases: ['Commercial Bank of Ceylon PLC', 'Commercial Bank of Ceylon', 'ComBank'],
    country: 'LK',
    identity: { description: 'Listed as a Sri Lankan licensed commercial bank in the CBSL register as at 31 May 2026.', source: BANK_REGISTER },
    domains: hosts(['combank.lk', 'www.combank.lk'], BANK_REGISTER),
    phones: [{ value: '+94112486000', scope: 'Sri Lanka head office, CBSL listing', source: BANK_REGISTER }],
  },
  {
    id: 'hnb',
    kind: 'bank',
    name: 'Hatton National Bank PLC',
    aliases: ['Hatton National Bank PLC', 'Hatton National Bank', 'HNB'],
    country: 'LK',
    identity: { description: 'Listed as a Sri Lankan licensed commercial bank in the CBSL register as at 31 May 2026.', source: BANK_REGISTER },
    domains: hosts(['hnb.net', 'www.hnb.net'], BANK_REGISTER),
    phones: [{ value: '+94112664664', scope: 'Sri Lanka head office, CBSL listing', source: BANK_REGISTER }],
  },
  {
    id: 'peoples-bank',
    kind: 'bank',
    name: "People’s Bank",
    aliases: ["People’s Bank", "People's Bank", 'Peoples Bank'],
    country: 'LK',
    identity: { description: 'Listed as a Sri Lankan licensed commercial bank in the CBSL register as at 31 May 2026.', source: BANK_REGISTER },
    domains: hosts(['peoplesbank.lk', 'www.peoplesbank.lk'], BANK_REGISTER),
    phones: [
      { value: '1961', scope: 'Sri Lanka domestic call centre shortcode', source: PEOPLES_CONTACT },
      { value: '+94112031001', scope: 'Overseas customer hotline', source: PEOPLES_CONTACT },
      { value: '+94113740740', scope: 'Sri Lanka head office', source: PEOPLES_CONTACT },
      { value: '+94112481481', scope: 'Sri Lanka head office', source: PEOPLES_CONTACT },
    ],
  },
  {
    id: 'dhl',
    kind: 'delivery',
    name: 'DHL',
    aliases: ['DHL Express', 'DHL'],
    country: 'GLOBAL',
    identity: { description: 'Identified by DHL’s own customer-service and fraud-awareness publications; no separate corporate-register check is claimed.', source: DHL_SECURITY },
    domains: [
      ...hosts(['dhl.com', 'www.dhl.com', 'dpdhl.com', 'www.dpdhl.com', 'group.dhl.com', 'del.dhl.com', 'dhl-news.com'], DHL_SECURITY),
      ...hosts(['mydhl.express.dhl'], DHL_LK_GUIDE),
    ],
    phones: [{ value: '+94112304304', country: 'LK', scope: 'DHL Express Sri Lanka customer service', source: DHL_LK_GUIDE }],
  },
  {
    id: 'fedex',
    kind: 'delivery',
    name: 'FedEx',
    aliases: ['FedEx'],
    country: 'GLOBAL',
    identity: { description: 'Identified by FedEx’s official support site, which names Advantis Express as its Sri Lanka service contractor; no separate corporate-register check is claimed.', source: FEDEX_CONTACT },
    domains: hosts(['fedex.com', 'www.fedex.com', 'local.fedex.com'], FEDEX_CONTACT),
    phones: [{ value: '+94114522222', country: 'LK', scope: 'Sri Lanka export/import support through nominated contractor Advantis Express', source: FEDEX_CONTACT }],
  },
  {
    id: 'paypal',
    kind: 'payment',
    name: 'PayPal',
    aliases: ['PayPal'],
    country: 'GLOBAL',
    identity: { description: 'Identified by PayPal’s official security and customer-service publication; no separate corporate-register or local-licensing check is claimed.', source: PAYPAL_SECURITY },
    domains: hosts(['paypal.com', 'www.paypal.com'], PAYPAL_SECURITY),
    phones: [{ value: '+18882211161', scope: 'US PayPal customer service', source: PAYPAL_SECURITY }],
  },
  {
    id: 'microsoft',
    kind: 'technology',
    name: 'Microsoft',
    aliases: ['Microsoft'],
    country: 'GLOBAL',
    identity: { description: 'Identified by Microsoft’s official support documentation; no separate corporate-register check is claimed.', source: MICROSOFT_SUPPORT },
    domains: hosts(['microsoft.com', 'www.microsoft.com', 'support.microsoft.com', 'learn.microsoft.com'], MICROSOFT_SUPPORT),
    phones: [],
  },
  {
    id: 'google',
    kind: 'technology',
    name: 'Google',
    aliases: ['Google'],
    country: 'GLOBAL',
    identity: { description: 'Identified by Google’s official support publications; no separate corporate-register check is claimed.', source: GOOGLE_SECURITY },
    domains: [
      ...hosts(['google.com', 'www.google.com', 'support.google.com', 'accounts.google.com'], GOOGLE_SECURITY),
      ...hosts(['myaccount.google.com'], GOOGLE_ACCOUNT_SECURITY),
    ],
    phones: [],
  },
  {
    id: 'apple',
    kind: 'technology',
    name: 'Apple',
    aliases: ['Apple'],
    country: 'GLOBAL',
    identity: { description: 'Identified by Apple’s official contact and corporate-address page; no separate corporate-register check is claimed.', source: APPLE_CONTACT },
    domains: hosts(['apple.com', 'www.apple.com', 'support.apple.com', 'getsupport.apple.com', 'account.apple.com', 'icloud.com', 'www.icloud.com'], APPLE_CONTACT),
    phones: [
      { value: '+18006927753', scope: 'US Apple Online Store sales and order enquiries', source: APPLE_CONTACT },
      { value: '+14089961010', scope: 'US corporate office', source: APPLE_CONTACT },
    ],
  },
  {
    id: 'edl',
    kind: 'utility',
    name: 'Electricity Distribution Lanka (Private) Limited',
    aliases: ['Electricity Distribution Lanka (Private) Limited', 'Electricity Distribution Lanka', 'EDL'],
    country: 'LK',
    identity: { description: 'Identified by EDL’s official website and CEB’s transition notice as the electricity distribution successor; no separate company-register check is claimed.', source: EDL_HOME },
    domains: [...hosts(['edl.lk', 'edlcare.edl.lk'], EDL_HOME), ...hosts(['myedlpay.edl.lk'], EDL_BALANCE)],
    phones: [{ value: '1987', scope: 'Sri Lanka domestic 24/7 call centre', source: EDL_CONTACT },
      { value: '+94112323232', scope: 'Sri Lanka head office', source: EDL_CONTACT }],
  },
  {
    id: 'amazon',
    kind: 'technology',
    name: 'Amazon',
    aliases: ['Amazon.com', 'Amazon Pay', 'Amazon'],
    country: 'GLOBAL',
    identity: { description: 'Identified as Amazon.com, Inc. in its official 2026 corporate release; no separate corporate-register or merchant-authentication check is claimed.', source: AMAZON_CORPORATE },
    domains: [
      ...hosts(['amazon.com', 'www.amazon.com', 'ir.aboutamazon.com', 'www.aboutamazon.com'], AMAZON_CORPORATE),
      ...hosts(['pay.amazon.com', 'payments.amazon.com', 'authorize.payments.amazon.com'], AMAZON_PAY_SECURITY),
    ],
    phones: [],
  },
];
