/**
 * Reviewed official-domain reference for the URL-shape rules (R-M4-21…23, v0.3-draft).
 *
 * This is a minimal projection of the reviewed organization directory
 * (`../ui/organization-directory.ts`; workspace source `code/ui/organization-directory.ts`,
 * source records reviewed 26 October–20 November 2026) into the
 * only two facts the rule engine needs: reviewed brand aliases and exact reviewed hostnames.
 * It is deliberately copied rather than imported, so the zero-setup rule engine keeps no
 * dependency on the browser-facing app layer. `../ui/reviewed-reference.test.ts` fails if
 * this projection and the reviewed directory drift.
 *
 * Engineering acceptance reference ONLY: a shape flag is evidence for review. It never proves
 * a host is malicious, never proves an official host is genuine for a message, and an unlisted
 * host is never labelled fake. No fetching, DNS or reputation lookup is performed anywhere.
 *
 * Two-level suffixes: used only to keep the subdomain-depth heuristic from counting a
 * registrable `.lk`/`co.uk` style name as depth. This is a documented small list, NOT a
 * Public Suffix List implementation — an unknown two-level suffix can under-count depth
 * (documented limitation, testing/M4-rule-catalogue.md v0.3-draft).
 */
export interface ReviewedBrand {
  organizationId: string;
  /** Reviewed names/aliases as recorded in the reviewed directory. */
  aliases: readonly string[];
  /** Exact reviewed hostnames (includeSubdomains is false in the reviewed directory). */
  officialHosts: readonly string[];
  /** Registrable reviewed domains derived from officialHosts. */
  officialDomains: readonly string[];
}

export const REVIEWED_BRANDS: readonly ReviewedBrand[] = [
  {
    organizationId: 'sampath-bank',
    aliases: ['Sampath Bank PLC', 'Sampath Bank', 'Sampath Vishwa'],
    officialHosts: ['sampath.lk', 'www.sampath.lk'],
    officialDomains: ['sampath.lk'],
  },
  {
    organizationId: 'bank-of-ceylon',
    aliases: ['Bank of Ceylon', 'BOC'],
    officialHosts: ['boc.lk', 'www.boc.lk'],
    officialDomains: ['boc.lk'],
  },
  {
    organizationId: 'commercial-bank',
    aliases: ['Commercial Bank of Ceylon PLC', 'Commercial Bank of Ceylon', 'ComBank'],
    officialHosts: ['combank.lk', 'www.combank.lk'],
    officialDomains: ['combank.lk'],
  },
  {
    organizationId: 'hnb',
    aliases: ['Hatton National Bank PLC', 'Hatton National Bank', 'HNB'],
    officialHosts: ['hnb.net', 'www.hnb.net'],
    officialDomains: ['hnb.net'],
  },
  {
    organizationId: 'peoples-bank',
    aliases: ['People’s Bank', "People's Bank", 'Peoples Bank'],
    officialHosts: ['peoplesbank.lk', 'www.peoplesbank.lk'],
    officialDomains: ['peoplesbank.lk'],
  },
  {
    organizationId: 'dhl',
    aliases: ['DHL Express', 'DHL'],
    officialHosts: ['dhl.com', 'www.dhl.com', 'dpdhl.com', 'www.dpdhl.com', 'group.dhl.com',
      'del.dhl.com', 'dhl-news.com', 'mydhl.express.dhl'],
    officialDomains: ['dhl.com', 'dpdhl.com', 'dhl-news.com', 'express.dhl'],
  },
  {
    organizationId: 'fedex',
    aliases: ['FedEx'],
    officialHosts: ['fedex.com', 'www.fedex.com', 'local.fedex.com'],
    officialDomains: ['fedex.com'],
  },
  {
    organizationId: 'paypal',
    aliases: ['PayPal'],
    officialHosts: ['paypal.com', 'www.paypal.com'],
    officialDomains: ['paypal.com'],
  },
  {
    organizationId: 'microsoft',
    aliases: ['Microsoft'],
    officialHosts: ['microsoft.com', 'www.microsoft.com', 'support.microsoft.com', 'learn.microsoft.com'],
    officialDomains: ['microsoft.com'],
  },
  {
    organizationId: 'google',
    aliases: ['Google'],
    officialHosts: ['google.com', 'www.google.com', 'support.google.com', 'accounts.google.com',
      'myaccount.google.com'],
    officialDomains: ['google.com'],
  },
  {
    organizationId: 'apple',
    aliases: ['Apple'],
    officialHosts: ['apple.com', 'www.apple.com', 'support.apple.com', 'getsupport.apple.com',
      'account.apple.com', 'icloud.com', 'www.icloud.com'],
    officialDomains: ['apple.com', 'icloud.com'],
  },
  {
    organizationId: 'edl',
    aliases: ['Electricity Distribution Lanka (Private) Limited', 'Electricity Distribution Lanka', 'EDL'],
    officialHosts: ['edl.lk', 'edlcare.edl.lk', 'myedlpay.edl.lk'],
    officialDomains: ['edl.lk'],
  },
  {
    organizationId: 'amazon',
    aliases: ['Amazon.com', 'Amazon Pay', 'Amazon'],
    officialHosts: ['amazon.com', 'www.amazon.com', 'ir.aboutamazon.com', 'www.aboutamazon.com',
      'pay.amazon.com', 'payments.amazon.com', 'authorize.payments.amazon.com'],
    officialDomains: ['amazon.com', 'aboutamazon.com'],
  },
  // ---- Tier 1–3 expansion projection (directory reviewed 20 November 2026) ----
  {
    organizationId: 'nsb',
    aliases: ['National Savings Bank', 'NSB'],
    officialHosts: ['nsb.lk', 'www.nsb.lk'],
    officialDomains: ['nsb.lk'],
  },
  {
    organizationId: 'seylan-bank',
    aliases: ['Seylan Bank PLC', 'Seylan Bank', 'Seylan'],
    officialHosts: ['seylan.lk', 'www.seylan.lk', 'seylanbank.lk', 'www.seylanbank.lk'],
    officialDomains: ['seylan.lk', 'seylanbank.lk'],
  },
  {
    organizationId: 'dialog-axiata',
    aliases: ['Dialog Axiata PLC', 'Dialog Axiata', 'Dialog'],
    officialHosts: ['dialog.lk', 'www.dialog.lk'],
    officialDomains: ['dialog.lk'],
  },
  {
    organizationId: 'slt-mobitel',
    aliases: ['Sri Lanka Telecom', 'SLT Mobitel', 'SLT', 'Mobitel'],
    officialHosts: ['slt.lk', 'www.slt.lk', 'sltmobitel.lk', 'www.sltmobitel.lk', 'mobitel.lk', 'www.mobitel.lk'],
    officialDomains: ['slt.lk', 'sltmobitel.lk', 'mobitel.lk'],
  },
  {
    organizationId: 'ceb',
    aliases: ['Ceylon Electricity Board', 'Ceylon Electricity', 'CEB'],
    officialHosts: ['ceb.lk', 'www.ceb.lk'],
    officialDomains: ['ceb.lk'],
  },
  {
    organizationId: 'leco',
    aliases: ['Lanka Electricity Company', 'LECO'],
    officialHosts: ['leco.lk', 'www.leco.lk'],
    officialDomains: ['leco.lk'],
  },
  {
    organizationId: 'ird',
    aliases: ['Inland Revenue Department', 'Inland Revenue', 'IRD'],
    officialHosts: ['ird.gov.lk', 'www.ird.gov.lk'],
    officialDomains: ['ird.gov.lk'],
  },
  {
    organizationId: 'sl-post',
    aliases: ['Department of Posts', 'Sri Lanka Post', 'SL Post', 'Post Office'],
    officialHosts: ['slpost.gov.lk', 'www.slpost.gov.lk'],
    officialDomains: ['slpost.gov.lk'],
  },
  {
    organizationId: 'immigration',
    aliases: ['Department of Immigration and Emigration', 'Immigration Department', 'Immigration and Emigration'],
    officialHosts: ['immigration.gov.lk', 'www.immigration.gov.lk'],
    officialDomains: ['immigration.gov.lk'],
  },
  {
    organizationId: 'daraz',
    aliases: ['Daraz Sri Lanka', 'Daraz'],
    officialHosts: ['daraz.lk', 'www.daraz.lk'],
    officialDomains: ['daraz.lk'],
  },
  {
    organizationId: 'kapruka',
    aliases: ['Kapruka'],
    officialHosts: ['kapruka.com', 'www.kapruka.com'],
    officialDomains: ['kapruka.com'],
  },
  {
    organizationId: 'whatsapp',
    aliases: ['WhatsApp', 'Meta Platforms', 'Meta'],
    officialHosts: ['whatsapp.com', 'www.whatsapp.com'],
    officialDomains: ['whatsapp.com'],
  },
  {
    organizationId: 'telegram',
    aliases: ['Telegram Messenger', 'Telegram'],
    officialHosts: ['telegram.org', 'www.telegram.org'],
    officialDomains: ['telegram.org'],
  },
  {
    organizationId: 'western-union',
    aliases: ['Western Union'],
    officialHosts: ['westernunion.com', 'www.westernunion.com'],
    officialDomains: ['westernunion.com'],
  },
  {
    organizationId: 'wise',
    aliases: ['Wise', 'TransferWise'],
    officialHosts: ['wise.com', 'www.wise.com'],
    officialDomains: ['wise.com'],
  },
] as const;

/** Documented small list of two-level suffixes used by the depth heuristic (not a PSL). */
export const REVIEWED_TWO_LEVEL_SUFFIXES: readonly string[] = [
  'gov.lk', 'com.lk', 'org.lk', 'net.lk', 'edu.lk', 'ltd.lk', 'web.lk', 'sch.lk', 'ac.lk',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'co.in', 'co.nz', 'co.za',
] as const;

/** Exact reviewed host, or a subdomain of one (shape-flag use; the evidence layer keeps
 * exact-host semantics where the directory says includeSubdomains is false). */
export function isReviewedOfficialHost(host: string): boolean {
  const value = host.toLowerCase().replace(/\.+$/, '');
  return REVIEWED_BRANDS.some(brand => brand.officialHosts.some(official =>
    value === official || value.endsWith(`.${official}`)));
}

/** Registerable domain under the documented suffix list (heuristic, not PSL-complete). */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.+$/, '').split('.');
  const lastTwo = labels.slice(-2).join('.');
  return REVIEWED_TWO_LEVEL_SUFFIXES.includes(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** Subdomain depth: labels above the registrable domain (www = 1, a.b.c.example.com = 3). */
export function subdomainDepth(host: string): number {
  const labels = host.toLowerCase().replace(/\.+$/, '').split('.');
  return labels.length - registrableDomain(host).split('.').length;
}

/** Reference labels eligible for the single-edit misspelling comparison (long labels only). */
export interface SpellingReference {
  label: string;
  officialDomain: string;
}

/** Only brands/trademarks are spelling references: a registrable candidate whose last label is a
 * brand token (for example `mydhl.express.dhl` → `express.dhl`) is kept in officialDomains for
 * projection fidelity but is NOT a spelling reference (generic words are not brand labels). */
const SPELLING_TLDS = new Set(['com', 'net', 'org', 'lk', 'edu', 'gov', 'info', 'io', 'co']);

const spellingReferences = new Map<string, SpellingReference>();
for (const brand of REVIEWED_BRANDS) {
  for (const domain of brand.officialDomains) {
    const labels = domain.split('.');
    const label = labels[0];
    if (label.length >= 6 && !label.includes('-') && SPELLING_TLDS.has(labels.at(-1) ?? '')) {
      spellingReferences.set(label, { label, officialDomain: domain });
    }
  }
}

export const SPELLING_REFERENCES: readonly SpellingReference[] = [...spellingReferences.values()];

/** True when the two labels differ by exactly one insertion, deletion, substitution or
 * adjacent transposition (Damerau-Levenshtein distance exactly 1). */
export function isSingleEditApart(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const differing: number[] = [];
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) differing.push(index);
    if (differing.length === 1) return true;
    return differing.length === 2 && differing[1] === differing[0] + 1
      && a[differing[0]] === b[differing[1]] && a[differing[1]] === b[differing[0]];
  }
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let shortIndex = 0;
  let longIndex = 0;
  let edits = 0;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) { shortIndex += 1; longIndex += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    longIndex += 1;
  }
  const remaining = shorter.length - shortIndex + (longer.length - longIndex);
  return edits + remaining <= 1;
}
