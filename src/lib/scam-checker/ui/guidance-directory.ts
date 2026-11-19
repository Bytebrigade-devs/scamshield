/** Reviewed help resources, deliberately separate from identity/contact matching facts.
 * No submitted URL, model output or browser metadata can add a resource or an action.
 * Sources reviewed 31 October 2026; the BOC, Commercial Bank and DHL pages were re-read
 * and added on 10 November 2026. HNB and FedEx remained unavailable, so no route or phone
 * is inferred for them; missing coverage stays an explicit fallback, not a guess.
 */
import type { EvidenceSource } from './organization-directory.ts';
import type { OrganizationVerification } from './organization-verification.ts';
import { isFresh } from './organization-verification.ts';
import type { LinkInspection } from './link-inspection.ts';

export type Exposure = 'received' | 'clicked' | 'shared' | 'paid';
export interface GuidanceResource {
  id: string;
  organizationId?: string;
  organizationName?: string;
  purpose: 'security' | 'recovery' | 'reporting' | 'general-contact';
  title: string;
  region: string;
  url?: string;
  phone?: string;
  scope?: string;
  source: EvidenceSource;
  status: 'current' | 'outdated';
}
export interface GuidanceAction {
  id: string;
  text: string;
  exposures: Exposure[];
  /** Lower numbers come first. Client selects exposures locally; all actions are server-owned. */
  priority: number;
  resourceIds: string[];
}
export interface GuidanceResources {
  checkedAt: string;
  resources: GuidanceResource[];
  actions: GuidanceAction[];
  limitations: string[];
  fallback: string;
}
export type GuidanceRecord = Omit<GuidanceResource, 'organizationName' | 'status'>;
const REVIEWED_AT = '2026-10-31';
/** Review date for the pages that were still blocked on 31 October and re-read on 10 November 2026. */
const REFRESHED_AT = '2026-11-10';
function evidence(url: string, title: string, context: string, reviewedAt = REVIEWED_AT): EvidenceSource {
  return { url, title, context, reviewedAt };
}
const FTC_RECOVERY = evidence('https://consumer.ftc.gov/articles/what-do-if-you-were-scammed',
  'FTC — What To Do if You Were Scammed',
  'US consumer guidance: immediately contact the payment provider, ask about reversal/refund, change exposed passwords and enable two-factor authentication. Recovery is not guaranteed; US legal remedies are not asserted for Sri Lanka.');
const FTC_PHISHING = evidence('https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams',
  'FTC — How To Recognize and Avoid Phishing Scams',
  'Use a website or number independently known to be real, not contact details in the message. If a link may have downloaded harmful software, update security software and scan.');
const CERT_REPORT = evidence('https://cert.gov.lk/report_incident', 'Sri Lanka CERT — Report Incident',
  'Sri Lanka incident-reporting portal and urgent cyber-security assistance shortcode 101. Personal financial scams and social-media incidents must use the portal, not cert@cert.gov.lk. Not a bank payment-reversal service.');
// Re-read 10 November 2026 from the public official pages; only the facts below are asserted.
const BOC_FRAUD = evidence('https://www.boc.lk/boc-protecting-yourself-from-fraud',
  'Bank of Ceylon — Protecting Yourself from Fraud',
  'Sri Lanka fraud-awareness page: be vigilant against phishing and financial fraud, avoid sharing sensitive information online or over the phone, and avoid clicking unfamiliar links. The page publishes no dedicated fraud hotline or reporting route; general contacts shown elsewhere on the site are not fraud hotlines.',
  REFRESHED_AT);
const COMBANK_SECURITY = evidence('https://www.combank.lk/security-measures',
  'Commercial Bank of Ceylon — Security Measures',
  'Sri Lanka online-banking security guidance: verify https and the padlock, never disclose the password, and do not reply to or click unsolicited emails asking for account details; contact the bank through the Message to Bank function inside Commercial Bank Online. No dedicated fraud hotline or shortcode is published on this page.',
  REFRESHED_AT);
const DHL_FRAUD = evidence('https://www.dhl.com/global-en/footer/fraud-awareness.html',
  'DHL — Fraud Awareness',
  'Global DHL fraud-awareness page: official DHL email is sent from @dhl.com and related DHL domains, though spoofing is possible; suspected fraudulent email, SMS or social accounts can be reported to the dedicated anti-abuse mailbox phishing@dhl.com. DHL states that customs duties and taxes are the only payments it requests by email or SMS. Country-specific procedures can differ.',
  REFRESHED_AT);

/** Resource IDs are stable; organization IDs refer to organization-directory.ts. */
export const GUIDANCE_DIRECTORY: readonly GuidanceRecord[] = [
  { id: 'lk-cert-report', purpose: 'reporting', title: 'Sri Lanka CERT incident reporting', region: 'LK',
    url: CERT_REPORT.url, phone: '101', scope: 'Sri Lanka cyber-security incident reporting and assistance; not a bank or payment-reversal hotline.', source: CERT_REPORT },
  { id: 'ftc-recovery', purpose: 'recovery', title: 'Steps after sharing information or sending money', region: 'US',
    url: FTC_RECOVERY.url, scope: 'US guidance; general account/payment precautions can help elsewhere. Local reporting and legal remedies differ.', source: FTC_RECOVERY },
  { id: 'ftc-phishing', purpose: 'security', title: 'Recognize and avoid phishing', region: 'US',
    url: FTC_PHISHING.url, scope: 'US guidance; do not assume US reporting channels or shortcodes apply in Sri Lanka.', source: FTC_PHISHING },
  { id: 'sampath-contact', organizationId: 'sampath-bank', purpose: 'general-contact', title: 'Sampath Bank official contact page', region: 'LK',
    url: 'https://www.sampath.lk/contact-us', scope: 'General contact page. No dedicated fraud number was confirmed in this review.',
    source: evidence('https://www.sampath.lk/contact-us', 'Sampath Bank — Contact', 'Official contact page with Get in touch / Connect with us sections. Dynamic telephone details were not exposed; no number or dedicated fraud route is inferred.') },
  { id: 'peoples-contact', organizationId: 'peoples-bank', purpose: 'general-contact', title: 'People’s Bank customer enquiries', region: 'LK',
    url: 'https://www.peoplesbank.lk/contact-us/', phone: '1961', scope: 'Sri Lanka domestic customer-enquiries call centre; not identified as a dedicated fraud hotline.',
    source: evidence('https://www.peoplesbank.lk/contact-us/', 'People’s Bank — Contact us', 'Contact General Number identifies 1961 as Customer Inquiries (Call Center), with separate overseas and head-office numbers. General contact, not a confirmed fraud hotline.') },
  { id: 'boc-fraud-awareness', organizationId: 'bank-of-ceylon', purpose: 'security', title: 'Bank of Ceylon fraud-awareness guidance', region: 'LK',
    url: BOC_FRAUD.url, scope: 'Sri Lanka fraud-awareness guidance: avoid sharing sensitive information and clicking unfamiliar links. No dedicated fraud hotline or reporting route is published on this page; general contacts are not fraud hotlines.',
    source: BOC_FRAUD },
  { id: 'combank-security-measures', organizationId: 'commercial-bank', purpose: 'security', title: 'Commercial Bank online-banking security measures', region: 'LK',
    url: COMBANK_SECURITY.url, scope: 'Sri Lanka online-banking security guidance: verify the secure site, keep the password private, treat unsolicited emails cautiously and use the in-app Message to Bank function. No dedicated fraud hotline or shortcode is published on this page.',
    source: COMBANK_SECURITY },
  { id: 'paypal-security', organizationId: 'paypal', purpose: 'security', title: 'PayPal fake-message and account-activity guidance', region: 'US',
    url: 'https://www.paypal.com/us/security/learn-about-fake-messages', scope: 'US PayPal security guidance; use the installed app or independently reached regional Help Center for account-specific help.',
    source: evidence('https://www.paypal.com/us/security/learn-about-fake-messages', 'PayPal — How to identify fake messages', 'Never rely on caller ID or return an automated call. Review activity by opening the PayPal app or independently typing its website. US customer-service contact scope is not Sri Lankan.') },
  { id: 'google-phishing', organizationId: 'google', purpose: 'security', title: 'Google phishing and security-alert guidance', region: 'GLOBAL',
    url: 'https://support.google.com/mail/answer/8253?hl=en', scope: 'Google Account / Gmail guidance, including direct security activity review and Gmail Report phishing.',
    source: evidence('https://support.google.com/mail/answer/8253?hl=en', 'Gmail Help — Avoid & report phishing emails', 'Do not enter a password after clicking an unexpected link; go directly to the service. Review Google security alerts independently and use Gmail Report phishing.') },
  { id: 'apple-security', organizationId: 'apple', purpose: 'recovery', title: 'Apple phishing, reporting and account-protection guidance', region: 'GLOBAL',
    url: 'https://support.apple.com/en-us/102568', scope: 'Apple device/account guidance; linked US law-enforcement reporting options are US-only.',
    source: evidence('https://support.apple.com/en-us/102568', 'Apple Support — Recognize and avoid social engineering schemes', 'If account details were entered on a scam site, change the Apple Account password immediately and enable two-factor authentication; report suspicious Apple messages using the channels described on the page.') },
  { id: 'microsoft-phishing', organizationId: 'microsoft', purpose: 'security', title: 'Microsoft support-email phishing guidance', region: 'GLOBAL',
    url: 'https://learn.microsoft.com/en-us/troubleshoot/azure/general/email-domains-support-agent', scope: 'Microsoft support-email guidance, with an official link to phishing protection/reporting. Not account recovery or sender authentication.',
    source: evidence('https://learn.microsoft.com/en-us/troubleshoot/azure/general/email-domains-support-agent', 'Microsoft Learn — Email domains used by support agents', 'For suspected phishing, do not reply, follow links or open attachments. Links to Microsoft’s Protect yourself from phishing guidance. Listed email domains alone do not authenticate a pasted sender.') },
  { id: 'amazon-security', organizationId: 'amazon', purpose: 'recovery', title: 'Amazon Pay phishing and exposed-account guidance', region: 'US',
    url: 'https://pay.amazon.com/help/201754760', scope: 'Amazon Pay US guidance; account/payment features and support availability vary by region.',
    source: evidence('https://pay.amazon.com/help/201754760', 'Amazon Pay — Internet scams and phishing', 'Close a suspected spoof site without entering information. If account information was entered, independently change the Amazon password; contact the card issuer if card details were disclosed. Reporting instructions are linked.') },
  { id: 'dhl-fraud-awareness', organizationId: 'dhl', purpose: 'security', title: 'DHL fraud-awareness and reporting guidance', region: 'GLOBAL',
    url: DHL_FRAUD.url, scope: 'Global DHL guidance: report suspected fraudulent DHL email, SMS or social accounts through the anti-abuse mailbox published on this page. Country-specific reporting and delivery procedures can differ; this does not authenticate a shipment or message.',
    source: DHL_FRAUD },
  { id: 'edl-contact', organizationId: 'edl', purpose: 'general-contact', title: 'EDL electricity-service customer support', region: 'LK',
    url: 'https://edl.lk/contact', phone: '1987', scope: 'Sri Lanka domestic 24/7 electricity call centre; not a dedicated financial-fraud hotline.',
    source: evidence('https://edl.lk/contact', 'Electricity Distribution Lanka — Contact Us', 'Official contact page lists 1987 as a 24/7 call centre and +94 11 232 3232 separately as head-office telephone. No dedicated fraud or payment-reversal number is claimed.') },
];

interface ReviewedAction extends GuidanceAction { source: EvidenceSource }
const ALL: Exposure[] = ['received', 'clicked', 'shared', 'paid'];
const REVIEWED_ACTIONS: readonly ReviewedAction[] = [
  { id: 'contact-payment-provider', text: 'If you sent money, contact the bank, card issuer or payment service you actually used immediately through its trusted app or the number on your card. Report the suspected scam and ask whether the payment can be stopped or reversed; recovery is not guaranteed.',
    exposures: ['paid'], priority: 10, resourceIds: ['ftc-recovery'], source: FTC_RECOVERY },
  { id: 'protect-exposed-information', text: 'If you shared a password, change it through the service’s trusted app or independently reached website, change reused passwords, and enable two-factor authentication. If you shared an OTP, PIN or card/bank details, contact the relevant provider immediately through an independently trusted channel.',
    exposures: ['shared'], priority: 20, resourceIds: ['ftc-recovery'], source: FTC_RECOVERY },
  { id: 'close-suspect-page', text: 'If you clicked, close the page and do not enter information, approve prompts or download anything. Clicking alone does not prove an account was compromised. If anything downloaded or installed, update trusted security software and run a scan.',
    exposures: ['clicked'], priority: 30, resourceIds: ['ftc-phishing'], source: FTC_PHISHING },
  { id: 'verify-independently', text: 'Do not reply, follow the message’s links, call its numbers, or share codes or money. Check the claim using an app you already trust or contact details obtained independently of the message.',
    exposures: ALL, priority: 40, resourceIds: ['ftc-phishing'], source: FTC_PHISHING },
  { id: 'report-lk-incident', text: 'In Sri Lanka, keep the message and transaction references for your report, then use Sri Lanka CERT’s incident portal for scam-related assistance. Reporting does not replace contacting your payment provider urgently if money or banking details were involved.',
    exposures: ALL, priority: 60, resourceIds: ['lk-cert-report'], source: CERT_REPORT },
];
export const GUIDANCE_FALLBACK = 'If a reviewed resource is missing or outdated, use an official app you already trust, the number printed on your card or statement, or an official channel you independently obtained. Do not use contact details from the suspicious message or assume an old contact is current.';

export function getGuidanceResources(verification: OrganizationVerification, directory: readonly GuidanceRecord[] = GUIDANCE_DIRECTORY,
  now = Date.now(), linkInspection?: LinkInspection): GuidanceResources {
  const relevant = new Map(verification.organizations.map(org => [org.id, org.name]));
  for (const finding of linkInspection?.findings ?? []) {
    // A possible imitation is a reason to offer help for a brand, not an attribution of the sender.
    for (const match of finding.matches) relevant.set(match.organizationId, match.organizationName);
  }
  const resources = directory.filter(record => !record.organizationId || relevant.has(record.organizationId)).map(record => {
    const current = isFresh(record.source, now);
    const { url, phone, ...metadata } = record;
    return { ...metadata, source: { ...record.source }, ...(record.organizationId ? { organizationName: relevant.get(record.organizationId) } : {}),
      ...(current ? { ...(url ? { url } : {}), ...(phone ? { phone } : {}) } : {}), status: current ? 'current' as const : 'outdated' as const };
  });
  const currentIds = new Set(resources.filter(resource => resource.status === 'current').map(resource => resource.id));
  const actions = REVIEWED_ACTIONS.filter(action => isFresh(action.source, now)).map(({ source: _source, ...action }) => ({
    ...action, exposures: [...action.exposures], resourceIds: action.resourceIds.filter(id => currentIds.has(id)),
  }));
  const limitations = [
    'Resources are reviewed offline, not live-verified. Organization relevance is not sender authentication or proof of fraud. Regional availability and reporting procedures can differ.',
    'General contact and head-office numbers are not dedicated fraud hotlines. Contact the provider you actually used for payment, which may differ from the organization named in the message.',
  ];
  for (const [id, name] of relevant) {
    if (!resources.some(resource => resource.organizationId === id && resource.status === 'current')) {
      limitations.push(`No current reviewed guidance resource is available for ${name}; use the independently trusted official-channel fallback.`);
    }
  }
  if (resources.some(resource => resource.status === 'outdated')) limitations.push('Outdated or future-dated resource destinations and phone numbers are withheld; source details are historical provenance only. Use the fallback.');
  if (actions.length !== REVIEWED_ACTIONS.length) limitations.push('Some action guidance is outside its review window and was withheld. Use an independently trusted official channel for current advice.');
  return { checkedAt: new Date(now).toISOString(), resources, actions, limitations, fallback: GUIDANCE_FALLBACK };
}
