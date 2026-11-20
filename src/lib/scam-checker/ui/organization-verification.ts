/** Offline matching against reviewed records. Never opens a submitted destination. */
import { extractCandidates } from '../preprocess/preprocess.ts';
import type { EvidenceSource, OrganizationKind, OrganizationRecord } from './organization-directory.ts';

export const REVIEW_WINDOW_DAYS = 90;
export const ORGANIZATION_NOTICE = 'Matching official contact details does not authenticate the sender or prove the message is safe.';
export type ContactStatus = 'matched' | 'not-confirmed' | 'another-organization' | 'outdated' | 'not-provided';
export interface ContactMatch {
  organizationId: string;
  organizationName: string;
  scope: string;
  source: EvidenceSource;
}
export interface ContactFinding {
  kind: 'phone' | 'website';
  value: string | null;
  status: ContactStatus;
  matches: ContactMatch[];
}
export interface OfficialContact {
  kind: 'phone' | 'website';
  value: string;
  scope: string;
  status: 'matched' | 'outdated';
  source: EvidenceSource;
}
export interface OrganizationFinding {
  id: string;
  name: string;
  kind: OrganizationKind;
  identifiedBy: 'name' | 'domain' | 'name-and-domain' | 'phone';
  identity: { status: 'matched' | 'outdated'; description: string; source: EvidenceSource };
  contacts: ContactFinding[];
  officialContacts: OfficialContact[];
}
export interface OrganizationVerification {
  checkedAt: string;
  reviewWindowDays: number;
  organizations: OrganizationFinding[];
  unmatchedContacts: ContactFinding[];
  notice: string;
}

export function isFresh(source: EvidenceSource, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt)) return false;
  const reviewed = Date.parse(`${source.reviewedAt}T00:00:00Z`);
  return Number.isFinite(reviewed) && new Date(reviewed).toISOString().slice(0, 10) === source.reviewedAt
    && reviewed <= now && now - reviewed <= REVIEW_WINDOW_DAYS * 86_400_000;
}

function hasAlias(text: string, alias: string): boolean {
  const escaped = alias.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text.normalize('NFC'));
}

export function hostname(value: string): string | null {
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return null;
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function extractWebsiteCandidates(text: string): string[] {
  // One left-to-right tokenizer consumes whole outer addresses. Independent scans
  // would incorrectly extract a trusted host nested in another URL's query/path.
  // Start only at a lexical boundary, never after an attached symbol/underscore.
  // Brackets/quotes are prose wrappers; other punctuation INSIDE a token stays
  // attached until parsing rejects it. Only conventional trailing punctuation is
  // removed below. Positive letter-only hostname regexes can carve google.com
  // out of 💩google.com, evil_google.com or google.com_foo before URL sees it.
  const start = String.raw`(?<![^\s<>"'()\[\]{}\u2018\u2019\u201C\u201D\u00AB\u00BB])`;
  const authority = String.raw`[^\s<>"'()\[\]{}\u2018\u2019\u201C\u201D\u00AB\u00BB/?#:]`;
  const scheme = String.raw`${start}[a-z][a-z\d+.-]*:[^\s<>"']+`;
  const email = String.raw`\b[A-Za-z0-9._%+-]+@[^\s<>"']+`;
  // A dotted authority must contain a letter-like suffix (not a decimal/phone).
  // Consume the WHOLE authority, including unsupported IDN symbols, marks,
  // underscores and runtime-unassigned characters. Do not validate it here.
  const bare = String.raw`${start}(?=${authority}*[.\u3002\uFF0E\uFF61]${authority}*[\p{L}\p{M}\p{Cn}]{2})${authority}+(?::[^\s<>"']*)?(?:[/?#][^\s<>"']*)?`;
  const tokens = new RegExp(`(?<scheme>${scheme})|(?<email>${email})|(?<bare>${bare})`, 'giu');
  const values: string[] = [];
  for (const match of text.matchAll(tokens)) {
    if (!match.groups?.email) values.push(match[0].replace(/[.,;:!?)\]}]+$/, ''));
  }
  return [...new Set(values)];
}

/** Only outer HTTP(S)/bare address hostnames; never nested links, emails or private paths. */
export function extractWebsiteHostnames(text: string): string[] {
  return [...new Set(extractWebsiteCandidates(text).map(hostname).filter((value): value is string => value !== null))];
}

export function phoneKey(value: string, country: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return digits;
  if (value.trim().startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (country === 'LK' && /^0\d{9}$/.test(digits)) return `+94${digits.slice(1)}`;
  return null;
}

function phones(text: string, directory: readonly OrganizationRecord[]): string[] {
  const values = [...extractCandidates(text).phones];
  for (const org of directory) {
    for (const phone of org.phones) {
      if (!/^\d{3,6}$/.test(phone.value)) continue;
      const pattern = new RegExp(`\\b(?:call|contact|hotline|tel|phone)\\s*[:.\\-]?\\s*(${phone.value})(?![\\p{L}\\p{N}@/_-]|\\.[\\p{L}\\p{N}])`, 'giu');
      for (const match of text.matchAll(pattern)) values.push(match[1]);
    }
  }
  return [...new Set(values)];
}

export function contactMatches(kind: ContactFinding['kind'], value: string, directory: readonly OrganizationRecord[]): ContactMatch[] {
  const host = kind === 'website' ? hostname(value) : null;
  return directory.flatMap(org => {
    if (kind === 'website') {
      return org.domains.filter(domain => host !== null && (host === domain.value
        || (domain.includeSubdomains && host.endsWith(`.${domain.value}`))))
        .map(domain => ({ organizationId: org.id, organizationName: org.name, scope: 'Reviewed website hostname', source: domain.source }));
    }
    return org.phones.filter(phone => phoneKey(value, phone.country ?? org.country) === phone.value)
      .map(phone => ({ organizationId: org.id, organizationName: org.name, scope: phone.scope, source: phone.source }));
  });
}

function finding(kind: ContactFinding['kind'], value: string | null, directory: readonly OrganizationRecord[], now: number, organizationId?: string): ContactFinding {
  if (value === null) return { kind, value, status: 'not-provided', matches: [] };
  const matches = contactMatches(kind, value, directory);
  const own = organizationId === undefined ? matches : matches.filter(match => match.organizationId === organizationId);
  const relevant = own.length ? own : matches;
  const fresh = relevant.some(match => isFresh(match.source, now));
  const status: ContactStatus = relevant.length === 0 ? 'not-confirmed' : !fresh ? 'outdated'
    : own.length ? 'matched' : 'another-organization';
  return { kind, value, status, matches: relevant };
}

export function verifyOrganizationContacts(text: string, directory: readonly OrganizationRecord[], now: number = Date.now()): OrganizationVerification {
  const urls = extractWebsiteCandidates(text);
  const numbers = phones(text, directory);
  const contacts = [
    ...urls.map(value => ({ kind: 'website' as const, value })),
    ...numbers.map(value => ({ kind: 'phone' as const, value })),
    ...(urls.length ? [] : [{ kind: 'website' as const, value: null }]),
    ...(numbers.length ? [] : [{ kind: 'phone' as const, value: null }]),
  ];
  const organizations: OrganizationFinding[] = [];
  for (const org of directory) {
    const byName = org.aliases.some(alias => hasAlias(text, alias));
    const byDomain = urls.some(value => contactMatches('website', value, [org]).length > 0);
    const byPhone = numbers.some(value => contactMatches('phone', value, [org]).length > 0);
    if (!byName && !byDomain && !byPhone) continue;
    organizations.push({
      id: org.id, name: org.name, kind: org.kind,
      identifiedBy: byName && byDomain ? 'name-and-domain' : byName ? 'name' : byDomain ? 'domain' : 'phone',
      identity: { status: isFresh(org.identity.source, now) ? 'matched' : 'outdated', ...org.identity },
      contacts: contacts.map(contact => finding(contact.kind, contact.value, directory, now, org.id)),
      officialContacts: [
        ...org.domains.map(domain => ({ kind: 'website' as const, value: domain.value, scope: 'Reviewed website hostname',
          status: isFresh(domain.source, now) ? 'matched' as const : 'outdated' as const, source: domain.source })),
        ...org.phones.map(phone => ({ kind: 'phone' as const, value: phone.value, scope: phone.scope,
          status: isFresh(phone.source, now) ? 'matched' as const : 'outdated' as const, source: phone.source })),
      ],
    });
  }
  return {
    checkedAt: new Date(now).toISOString(), reviewWindowDays: REVIEW_WINDOW_DAYS, organizations,
    unmatchedContacts: organizations.length ? [] : contacts.map(contact => finding(contact.kind, contact.value, directory, now)),
    notice: ORGANIZATION_NOTICE,
  };
}
