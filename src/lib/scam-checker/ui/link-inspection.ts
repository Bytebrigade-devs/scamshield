/** Offline hostname comparison only. No HTTP, DNS, redirects, page content or reputation.
 * Only confusables and script ranges are Unicode 18. Node's runtime Unicode data still
 * governs regex properties, NFD and IDNA (Node 24 here: ICU 78.3 / Unicode 17.0).
 * Runtime-unassigned characters are conservatively not inspectable, not silently safe.
 */
import { domainToASCII, domainToUnicode, URL } from 'node:url';
import { isIP } from 'node:net';
import type { EvidenceSource, OrganizationRecord } from './organization-directory.ts';
import { extractWebsiteCandidates, isFresh } from './organization-verification.ts';
import { CONFUSABLE_MAPPINGS, SCRIPT_RANGES, UNICODE_VERSION } from './confusables.generated.ts';

export const MAX_INSPECTED_HOSTNAMES = 20;
export interface LinkMatch {
  organizationId: string;
  organizationName: string;
  officialDomain: string;
  source: EvidenceSource;
  outdated: boolean;
}
export interface LinkFinding {
  hostname: string;
  unicodeHostname: string;
  status: 'official-match' | 'possible-lookalike' | 'unconfirmed' | 'not-inspectable';
  matches: LinkMatch[];
  scripts: string[];
}
export interface LinkInspection {
  checkedAt: string;
  unicodeVersion: string;
  findings: LinkFinding[];
  limitations: string[];
  truncated: boolean;
}

const mappings = new Map(CONFUSABLE_MAPPINGS);
function scriptOf(character: string): string {
  const cp = character.codePointAt(0)!;
  let low = 0;
  let high = SCRIPT_RANGES.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const [start, end, script] = SCRIPT_RANGES[mid];
    if (cp < start) high = mid - 1;
    else if (cp > end) low = mid + 1;
    else return script;
  }
  return 'Unsupported';
}

/** UTS #39 skeleton: NFD → single mapping pass (complete targets) → NFD.
 * This is deliberately not transliteration, diacritic stripping or edit distance.
 */
export function confusableSkeleton(value: string): string {
  return Array.from(value.normalize('NFD'), character => mappings.get(character) ?? character).join('').normalize('NFD');
}

function parsedFinding(candidate: string): LinkFinding {
  let host = '';
  let unicode = '';
  let scripts: string[] = [];
  const notInspectable = (): LinkFinding => ({ hostname: host, unicodeHostname: unicode,
    status: 'not-inspectable', matches: [], scripts });
  try {
    const bareHostWithPort = /^[^:/?#@]+\.[^:/?#@]+:\d+(?:[/?#]|$)/u.test(candidate);
    if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^https?:\/\//i.test(candidate) && !bareHostWithPort) return notInspectable();
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    host = url.hostname.toLowerCase().replace(/\.$/, '');
    unicode = domainToUnicode(host);
    scripts = [...new Set(Array.from(unicode.normalize('NFD'), scriptOf))].sort();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || candidate.includes('\\')
      || !host || host.length > 253 || isIP(host) || host.startsWith('[')
      || !unicode || domainToASCII(unicode).toLowerCase() !== host
      || !/^\p{Assigned}+$/u.test(unicode)
      // Some Node/IDNA versions preserve malformed A-labels unchanged instead of failing.
      || host.split('.').some(label => label.startsWith('xn--') && domainToUnicode(label) === label)
      || host.split('.').length < 2 || host.split('.').some(label => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))
      || scripts.includes('Unsupported')) return notInspectable();
    return { hostname: host, unicodeHostname: unicode, scripts, status: 'unconfirmed', matches: [] };
  } catch {
    return notInspectable();
  }
}

export function inspectLinks(text: string, directory: readonly OrganizationRecord[], now = Date.now()): LinkInspection {
  const findings: LinkFinding[] = [];
  const seen = new Set<string>();
  let truncated = false;
  // Build only after this function is called by an admitted extraction stage.
  const references = directory.flatMap(org => org.domains.map(domain => ({ org, domain,
    parsed: parsedFinding(`https://${domain.value}`) })));
  for (const candidate of extractWebsiteCandidates(text)) {
    const finding = parsedFinding(candidate);
    // Keep inspectability distinct: a credential-bearing URL cannot suppress a later plain host.
    // Invalid candidates with no parseable hostname share an anonymous finding (never echo paths).
    const key = `${finding.status}:${finding.hostname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (findings.length === MAX_INSPECTED_HOSTNAMES) { truncated = true; continue; }
    if (finding.status !== 'not-inspectable') {
      const exact = references.filter(({ domain, parsed }) => parsed.status !== 'not-inspectable'
        && (finding.hostname === parsed.hostname || (domain.includeSubdomains && finding.hostname.endsWith(`.${parsed.hostname}`))));
      const similar = exact.length ? [] : references.filter(({ parsed }) => parsed.status !== 'not-inspectable'
        // DNS names are case-insensitive; fold AFTER mapping, since Unicode maps 0 → O.
        && confusableSkeleton(finding.unicodeHostname).toLowerCase() === confusableSkeleton(parsed.unicodeHostname).toLowerCase());
      const matches = exact.length ? exact : similar;
      finding.status = exact.length ? 'official-match' : similar.length ? 'possible-lookalike' : 'unconfirmed';
      finding.matches = matches.map(({ org, domain }) => ({ organizationId: org.id, organizationName: org.name,
        officialDomain: domain.value, source: { ...domain.source }, outdated: !isFresh(domain.source, now) }));
    }
    findings.push(finding);
  }
  const limitations = [
    'Offline hostname comparison only: submitted links were not opened, resolved through DNS, or checked for redirects, content or reputation.',
    'A reviewed hostname match does not authenticate the sender or prove that a message, page or payment is safe. Unlisted hosts are unconfirmed, not known fakes.',
    'Lookalike comparison is limited to Unicode 18 Latin, Greek, Cyrillic, Common and Inherited scripts; it is not comprehensive spoof detection.',
    `Regex properties, IDNA and NFD normalization use the Node.js runtime Unicode data (${process.versions.unicode}, ICU ${process.versions.icu}); only confusable mappings and script ranges are pinned to Unicode ${UNICODE_VERSION}. Newer runtime-unassigned characters are not inspectable.`,
  ];
  if (findings.some(finding => finding.matches.some(match => match.outdated))) limitations.push('Some reference records are outdated or future-dated; they do not establish a current official hostname.');
  if (findings.some(finding => finding.status === 'not-inspectable')) limitations.push('Some candidates could not be inspected: unsupported scripts, invalid IDNA/DNS names, IP addresses, credentials or unsupported URL forms.');
  if (truncated) limitations.push(`Only the first ${MAX_INSPECTED_HOSTNAMES} distinct hostname/form candidates were inspected; additional candidates were omitted.`);
  return { checkedAt: new Date(now).toISOString(), unicodeVersion: UNICODE_VERSION, findings, limitations, truncated };
}

/** Only compact lookalike evidence goes to the model, never guidance URLs or actions. */
export function possibleLookalikeEvidence(inspection?: LinkInspection): unknown[] {
  return inspection?.findings.filter(finding => finding.status === 'possible-lookalike').map(finding => ({
    hostname: finding.hostname, unicodeHostname: finding.unicodeHostname, status: finding.status,
    matches: finding.matches.map(match => ({ organizationId: match.organizationId, officialDomain: match.officialDomain, outdated: match.outdated })),
  })) ?? [];
}
