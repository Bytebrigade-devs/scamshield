import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import dns from 'node:dns';
import { domainToASCII, fileURLToPath } from 'node:url';
import { inspectLinks, confusableSkeleton, possibleLookalikeEvidence } from './link-inspection.ts';
import { CONFUSABLE_MAPPINGS } from './confusables.generated.ts';
import type { OrganizationRecord } from './organization-directory.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';
import { extractWebsiteCandidates } from './organization-verification.ts';

const NOW = Date.UTC(2026, 9, 31, 12);
const source = { url: 'https://google.example/security', title: 'Synthetic reviewed source', reviewedAt: '2026-10-29', context: 'Synthetic hostname reference; not a live contact.' };
const DIRECTORY: readonly OrganizationRecord[] = [
  { id: 'google-fixture', name: 'Google fixture', kind: 'technology', country: 'GLOBAL', aliases: ['Google fixture'],
    identity: { description: 'Synthetic fixture', source }, phones: [], domains: [{ value: 'google.com', includeSubdomains: false, source }] },
  { id: 'microsoft-fixture', name: 'Microsoft fixture', kind: 'technology', country: 'GLOBAL', aliases: ['Microsoft fixture'],
    identity: { description: 'Synthetic fixture', source }, phones: [], domains: [{ value: 'microsoft.com', includeSubdomains: false, source }] },
];
function finding(host: string, directory = DIRECTORY) { return inspectLinks(`Check https://${host}/private?token=not-for-output`, directory, NOW).findings[0]; }

test('pinned Unicode source, licence and reproducible script-limited output have integrity', () => {
  const raw = readFileSync(new URL('./vendor/unicode-18.0.0/confusables.txt', import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex').toUpperCase(), '6ED3EE967C9DFDF6677D563C9985182FBC50A2EFB7D6059CD57B2E2CE18F5B92');
  assert.match(readFileSync(new URL('./vendor/unicode-18.0.0/LICENSE.txt', import.meta.url), 'utf8'), /UNICODE LICENSE V3/);
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./scripts/generate-confusables.ts', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.match(output, /integrity verified/);
  assert.equal(new Map(CONFUSABLE_MAPPINGS).has('\u05ad'), false, 'Hebrew source mapping is excluded');
});

test('skeleton uses NFD on both sides of one complete multi-codepoint mapping pass', () => {
  assert.equal(confusableSkeleton('m'), 'rn');
  assert.equal(confusableSkeleton('æ'), 'ae');
  assert.equal(confusableSkeleton('é'), confusableSkeleton('e\u0301'));
  assert.notEqual(confusableSkeleton('é'), confusableSkeleton('e'), 'Do not strip accents');
  assert.equal(finding('rnicrosoft.com').status, 'possible-lookalike');
});

test('current exact official hostname matches take priority over skeleton collisions', () => {
  const directory = [...DIRECTORY, { ...DIRECTORY[0], id: 'alternate-fixture', domains: [{ value: 'g00gle.com', includeSubdomains: false, source }] }];
  const result = finding('GOOGLE.COM.', directory);
  assert.equal(result.status, 'official-match');
  assert.deepEqual(result.matches.map(match => match.organizationId), ['google-fixture']);
  assert.equal(result.matches[0].outdated, false);
});

test('Greek, Cyrillic, digit and multi-letter confusables produce possible-lookalike evidence', () => {
  for (const host of ['gοοgle.com', 'gооgle.com', 'g00gle.com', 'goog1e.com', 'ɡoogle.com']) {
    const result = finding(host);
    assert.equal(result.status, 'possible-lookalike', host);
    assert.equal(result.matches[0].organizationId, 'google-fixture');
    assert.equal(result.hostname, domainToASCII(host));
    assert.equal(result.unicodeHostname, host);
  }
});

test('punycode and Unicode representations produce identical IDNA-round-tripped findings', () => {
  const unicode = 'gооgle.com';
  assert.deepEqual(finding(unicode), finding(domainToASCII(unicode)));
});

test('bare hostnames with numeric ports are inspected without accepting unsupported schemes', () => {
  for (const [text, status] of [
    ['google.com:443', 'official-match'],
    ['g00gle.com:8443/path?ref=1', 'possible-lookalike'],
    ['google.com:99999', 'not-inspectable'],
    ['ftp://google.com:443', 'not-inspectable'],
    ['javascript:google.com', 'not-inspectable'],
  ]) {
    assert.equal(inspectLinks(text, DIRECTORY, NOW).findings[0]?.status, status, text);
  }
});

test('ordinary internationalized Latin hosts remain unconfirmed, never automatically fake', () => {
  for (const host of ['bücher.example', 'example.invalid', 'unlisted-bank.example']) {
    const result = finding(host);
    assert.equal(result.status, 'unconfirmed', host);
    assert.deepEqual(result.matches, []);
  }
});

test('unsupported scripts, invalid IDNA, credentials, IPs and non-HTTP schemes are not inspectable', () => {
  for (const url of ['https://例子.example', 'https://සිංහල.example', 'https://مثال.example', 'https://xn--a.example',
    'https://google.com@evil.example', 'https://127.0.0.1', 'https://[::1]', 'ftp://google.com', 'javascript:google.com',
    'https://a_b.example', 'https://-google.com', 'https://a\u200db.example']) {
    const result = inspectLinks(url, DIRECTORY, NOW);
    assert.equal(result.findings[0]?.status, 'not-inspectable', url);
    assert.deepEqual(result.findings[0].matches, []);
    assert.ok(result.limitations.some(limit => limit.includes('could not be inspected')));
  }
});

test('unsupported scripts are explicit and runtime Unicode/IDNA limitations are disclosed', () => {
  const result = inspectLinks('https://例子.example', DIRECTORY, NOW);
  assert.ok(result.findings[0].scripts.includes('Unsupported'));
  assert.equal(result.unicodeVersion, '18.0.0');
  assert.ok(result.limitations.some(limit => limit.includes(process.versions.unicode)));
  assert.ok(result.limitations.some(limit => limit.includes('not comprehensive')));
});

test('Unicode 18 Latin characters unassigned by this runtime are not inspectable, including bare candidates', () => {
  // U+A7DD is Latin in pinned Unicode 18 Scripts.txt, but not assigned in Node 24 / Unicode 17.
  assert.equal(/\p{Assigned}/u.test('\ua7dd'), false);
  for (const text of ['https://a\ua7ddgoogle.com', 'a\ua7ddgoogle.com']) {
    const result = inspectLinks(text, DIRECTORY, NOW);
    assert.equal(result.findings[0]?.status, 'not-inspectable', text);
    assert.equal(result.findings.some(item => item.status === 'official-match'), false);
  }
});

test('stale, future and invalid official references remain explicitly outdated for exact and lookalike comparisons', () => {
  for (const reviewedAt of ['2026-01-01', '2026-11-01', '2026-02-30']) {
    const directory = [{ ...DIRECTORY[0], domains: [{ value: 'google.com', includeSubdomains: false, source: { ...source, reviewedAt } }] }];
    for (const host of ['google.com', 'g00gle.com']) {
      const result = inspectLinks(`https://${host}`, directory, NOW);
      assert.equal(result.findings[0].status, host === 'google.com' ? 'official-match' : 'possible-lookalike');
      assert.equal(result.findings[0].matches[0].outdated, true);
      assert.ok(result.limitations.some(limit => limit.includes('outdated')));
    }
  }
});

test('subdomains, suffix attacks and brand-looking labels never bypass explicit domain policy', () => {
  for (const host of ['login.google.com', 'google.com.evil.example', 'g00gle.com.evil.example', 'g00gle.example', 'foo.g00gle.com']) {
    assert.equal(finding(host).status, 'unconfirmed', host);
  }
  const approved = [{ ...DIRECTORY[0], domains: [{ value: 'google.com', includeSubdomains: true, source }] }];
  assert.equal(finding('login.google.com', approved).status, 'official-match');
  assert.equal(finding('foo.g00gle.com', approved).status, 'unconfirmed', 'Do not invent wildcard skeleton matching');
});

test('tokenization consumes outer URLs, not nested paths, queries, email domains or fragments', () => {
  for (const value of ['https://evil.example/google.com', 'https://evil.example/?next=https://google.com',
    'evil.example?next=https://google.com', 'www.evil.example#https://google.com', 'agent@google.com']) {
    const result = inspectLinks(value, DIRECTORY, NOW);
    assert.equal(result.findings.some(item => item.status === 'official-match'), false, value);
    assert.equal(result.findings.some(item => item.status === 'possible-lookalike'), false, value);
  }
});

test('bare Unicode and decomposed hostnames are extracted without becoming partial official domains', () => {
  assert.equal(inspectLinks('Visit gооgle.com', DIRECTORY, NOW).findings[0].status, 'possible-lookalike');
  assert.equal(inspectLinks('Visit e\u0301xample.example', DIRECTORY, NOW).findings[0].status, 'unconfirmed');
});

test('cap twenty is truthful at the boundary, including duplicates and extra distinct forms', () => {
  const hosts = Array.from({ length: 21 }, (_, index) => `https://host${index}.example`);
  assert.equal(inspectLinks(hosts.slice(0, 20).join(' '), DIRECTORY, NOW).truncated, false);
  const full = inspectLinks(hosts.join(' '), DIRECTORY, NOW);
  assert.equal(full.findings.length, 20);
  assert.equal(full.truncated, true);
  assert.ok(full.limitations.some(limit => limit.includes('additional candidates were omitted')));
  assert.equal(inspectLinks(Array(30).fill('https://google.com/different').join(' '), DIRECTORY, NOW).truncated, false);
  assert.equal(inspectLinks('https://user@google.com https://google.com', DIRECTORY, NOW).findings.length, 2);
});

test('inspection performs no network/DNS calls, exposes no path/query/userinfo and never assigns risk', () => {
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('No fetch allowed'); });
  const dnsLookup = mock.method(dns, 'lookup', () => { throw new Error('No DNS allowed'); });
  try {
    const result = inspectLinks('https://g00gle.com/secret?private=1 https://user:password@google.com/path', DIRECTORY, NOW);
    const serialized = JSON.stringify(result);
    for (const secret of ['secret', 'private=1', 'user:password', '/path', 'riskLevel', 'senderAuthenticated']) assert.equal(serialized.includes(secret), false);
    assert.equal(network.mock.callCount(), 0);
    assert.equal(dnsLookup.mock.callCount(), 0);
  } finally { network.mock.restore(); dnsLookup.mock.restore(); }
});

test('compact AI evidence excludes sources, limits and official/unconfirmed findings', () => {
  const inspection = inspectLinks('https://g00gle.com https://google.com https://unknown.example', DIRECTORY, NOW);
  const evidence = possibleLookalikeEvidence(inspection) as any[];
  assert.equal(evidence.length, 1);
  assert.deepEqual(Object.keys(evidence[0].matches[0]).sort(), ['officialDomain', 'organizationId', 'outdated']);
  assert.equal(JSON.stringify(evidence).includes(source.url), false);
});

for (const host of ['💩google.com', 'google.com💩', 'evil_google.com', 'google.com_foo',
  '\u0301google.com', 'google.com\u0301', '☃google.com', 'google.com☃', 'evil%google.com',
  'google.com!evil', 'google.com,evil', 'google.com;evil', '💩www.google.com', 'www.google.com💩']) {
  test(`whole outer bare-host regression: ${host} never carves an official substring`, () => {
    assert.deepEqual(extractWebsiteCandidates(host), [host], 'The unsupported outer token must be consumed, not skipped or partially extracted');
    const result = inspectLinks(host, DIRECTORY, NOW);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings.some(item => item.status === 'official-match'), false);
    assert.equal(result.findings.some(item => item.hostname === 'google.com'), false);
    assert.equal(possibleLookalikeEvidence(result).length, 0);
  });
}

test('bare hostname prose punctuation remains usable without carving nested queries, emails or userinfo', () => {
  for (const text of ['Visit google.com.', 'Check (google.com), please.', 'See [google.com]; then stop.',
    'Visit “google.com” or «google.com».', 'Visit google.com!']) {
    assert.equal(inspectLinks(text, DIRECTORY, NOW).findings.find(item => item.hostname === 'google.com')?.status, 'official-match', text);
  }
  for (const text of ['evil.example?next=google.com', 'evil.example?next=https://google.com',
    '💩evil.example?next=google.com', 'google.com@evil.example', 'https://google.com@evil.example',
    'person@google.com', 'person+tag@google.com', 'α@google.com', 'evil.example/google.com']) {
    assert.equal(inspectLinks(text, DIRECTORY, NOW).findings.some(item => item.status === 'official-match'), false, text);
  }
});

test('actual reviewed directory sees full IDNA symbol hosts and invalid underscore tokens, not official substrings', () => {
  for (const host of ['💩google.com', 'google.com💩', 'evil_google.com', 'google.com_foo']) {
    const result = inspectLinks(host, ORGANIZATION_DIRECTORY, NOW);
    assert.equal(result.findings[0].hostname, new URL(`https://${host}`).hostname);
    assert.ok(['unconfirmed', 'not-inspectable'].includes(result.findings[0].status));
    assert.deepEqual(result.findings[0].matches, []);
  }
});
