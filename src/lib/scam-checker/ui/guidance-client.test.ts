import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExposures, relevantResources, selectedActions, toggleExposure } from './public/guidance.js';
import { guidanceEvidence, linkEvidence, sourceIsCurrent } from './public/evidence.js';
import { reviewedSource } from './public/organization-card.js';
import { linkInspectionCard, officialResourcesCard } from './public/guidance-cards.js';
import { getGuidanceResources } from './guidance-directory.ts';
import { verifyOrganizationContacts } from './organization-verification.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';

const NOW = '2026-10-31T10:30:00.000Z';
const SOURCE = { url: 'https://www.cert.gov.lk/report_incident', title: 'Sri Lanka CERT reporting', reviewedAt: '2026-10-31', context: 'Sri Lanka' };
const CURRENT = guidanceEvidence(getGuidanceResources(verifyOrganizationContacts('', ORGANIZATION_DIRECTORY, Date.parse(NOW)), undefined, Date.parse(NOW)));
const states = [[], ['clicked'], ['shared'], ['paid'], ['clicked', 'shared'], ['clicked', 'paid'], ['shared', 'paid'], ['clicked', 'shared', 'paid'], ['received']];
test('all eight boolean exposure combinations plus exclusive received are nine distinct states', () => {
  assert.equal(new Set(states.map(state => JSON.stringify(state))).size, 9);
  states.forEach(state => {
    assert.deepEqual(normalizeExposures(state), state);
    const actions = selectedActions(state, CURRENT.resources, CURRENT.actions);
    const urgent = state.includes('shared') || state.includes('paid');
    assert.equal(actions[0].id, urgent ? 'contact-bank' : 'pause', JSON.stringify(state));
    assert.equal(actions.some(action => action.id === 'secure-accounts'), state.includes('shared'));
    assert.equal(actions.some(action => action.id === 'payment-evidence'), state.includes('paid'));
    assert.equal(actions.some(action => action.id === 'check-device'), state.includes('clicked'));
    assert.equal(new Set(actions.map(action => action.id)).size, actions.length);
    assert.deepEqual(actions.map(action => action.priority), [...actions.map(action => action.priority)].sort((a, b) => a - b));
  });
});
test('received is exclusive, can be unchecked, and no answer is not received', () => {
  assert.deepEqual(toggleExposure(['clicked', 'paid'], 'received', true), ['received']);
  assert.deepEqual(toggleExposure(['received'], 'shared', true), ['shared']);
  assert.deepEqual(toggleExposure(['received'], 'received', false), []);
  assert.deepEqual(toggleExposure(['clicked'], 'clicked', false), []);
  assert.deepEqual(toggleExposure([], 'unknown', true), []);
  assert.deepEqual(normalizeExposures(['paid', 'received', 'clicked', 'paid', 'bogus']), ['clicked', 'paid']);
  assert.deepEqual(normalizeExposures(null), []);
});
test('urgent conditional bank step never treats a named organization as the user bank', () => {
  const first = selectedActions(['shared'], [...CURRENT.resources, { id: 'some-bank', purpose: 'recovery', status: 'current' }], CURRENT.actions)[0];
  assert.match(first.text, /^If you shared banking or payment details, or sent money/);
  assert.match(first.text, /your own bank/);
  assert.match(first.text, /may not be your bank/);
  assert.deepEqual(first.resourceIds, [], 'do not link a named organization as the user bank');
});
test('resources retain correct purpose and recovery resources require relevant exposure', () => {
  const resources = ['security', 'recovery', 'reporting', 'general-contact'].map(purpose => ({ id: purpose, purpose }));
  assert.deepEqual(relevantResources(resources, []).map(item => item.id), ['security', 'reporting', 'general-contact']);
  assert.equal(relevantResources(resources, ['shared']).length, 4);
  const report = selectedActions([], CURRENT.resources, CURRENT.actions).find(action => action.id === 'report');
  assert.deepEqual(report.resourceIds, ['lk-cert-report']);
});
test('server-owned action references choose reviewed sources without exporting API prose', () => {
  const evidence = guidanceEvidence({ checkedAt: NOW, resources: [{ id: 'cert-report', purpose: 'reporting', title: 'CERT report', region: 'LK', source: SOURCE, status: 'current', url: SOURCE.url }],
    actions: [{ id: 'report-lk-incident', text: 'PRIVATE arbitrary response prose', exposures: ['received', 'clicked', 'shared', 'paid'], priority: 60, resourceIds: ['cert-report', 'unknown'] }] });
  const action = selectedActions([], evidence.resources, evidence.actions).find(action => action.id === 'report');
  assert.deepEqual(action.resourceIds, ['cert-report']);
  assert.equal(action.text.includes('PRIVATE'), false);
  assert.equal(JSON.stringify(evidence.actions).includes('PRIVATE'), false);
});
test('reviewed source validation is host-specific, not arbitrary lk or gov.lk', () => {
  for (const host of ['www.cert.gov.lk', 'www.police.lk', 'support.google.com', 'edl.lk']) {
    assert.ok(reviewedSource({ ...SOURCE, url: `https://${host}/guidance` }));
  }
  for (const url of ['https://evil.lk/', 'https://unreviewed.gov.lk/', 'https://cert.gov.lk.evil.example/', 'https://cert.gov.lk@evil.example/', 'http://cert.gov.lk/', 'javascript:alert(1)', 'https://cert.gov.lk:444/', 'https://user@cert.gov.lk/']) {
    assert.equal(reviewedSource({ ...SOURCE, url }), null, url);
  }
  assert.equal(reviewedSource({ ...SOURCE, reviewedAt: '2026-02-30' }), null);
});
test('missing/older metadata falls back honestly and invalid resource URLs never become trusted', () => {
  assert.equal(guidanceEvidence(undefined).available, false);
  assert.equal(linkEvidence({ findings: [] }).available, false);
  const metadata = { checkedAt: NOW, resources: [
    { id: 'cert-report', purpose: 'reporting', title: 'Report', region: 'Sri Lanka', url: 'https://evil.lk/report', source: SOURCE, status: 'current' },
    { id: 'no-date', purpose: 'reporting', title: 'Report', region: 'Sri Lanka', source: { ...SOURCE, reviewedAt: 'bad' }, status: 'current' },
  ] };
  const evidence = guidanceEvidence(metadata);
  assert.deepEqual(evidence.resources, []);
  assert.equal(evidence.limited, true);
  assert.match(evidence.fallback, /independently trusted/);
});
test('resource freshness is determined per source and future sources are never current', () => {
  assert.equal(sourceIsCurrent(SOURCE, NOW), true);
  const resources = ['2026-10-31', '2026-01-01', '2026-11-01'].map((reviewedAt, index) => ({
    id: `cert-${index}`, purpose: 'reporting', title: 'Report', region: 'Sri Lanka', scope: 'Incident reporting',
    source: { ...SOURCE, reviewedAt }, status: 'current', url: SOURCE.url,
  }));
  assert.deepEqual(guidanceEvidence({ checkedAt: NOW, resources }).resources.map(item => item.status), ['current', 'outdated', 'outdated']);
});
test('link statuses are source-backed, downgrade missing/stale official matches, and preserve lookalike caveats', () => {
  const finding = { hostname: 'xn--host.example', unicodeHostname: 'hоst.example', scripts: ['Latin', 'Cyrillic'], status: 'official-match', matches: [] };
  const match = { organizationName: 'Sri Lanka CERT', officialDomain: 'cert.gov.lk', source: SOURCE, outdated: false };
  const metadata = { checkedAt: NOW, findings: [finding, { ...finding, matches: [match] },
    { ...finding, matches: [{ ...match, outdated: true }] }, { ...finding, status: 'possible-lookalike', matches: [match] },
    { ...finding, status: 'not-inspectable' }], limitations: [], truncated: false };
  assert.deepEqual(linkEvidence(metadata).findings.map(item => item.status), ['unconfirmed', 'official-match', 'unconfirmed', 'possible-lookalike', 'not-inspectable']);
});

function node(tag: string, attrs: any = {}, children: any = []) {
  return { tag, attrs, children: [].concat(children).filter(item => item !== null && item !== undefined), append(...values: any[]) { this.children.push(...values.filter(item => item !== null && item !== undefined)); } };
}
function flatten(value: any): any[] { return typeof value === 'object' && value ? [value, ...value.children.flatMap(flatten)] : []; }
function text(value: any): string { return typeof value === 'string' ? value : value?.children?.map(text).join(' ') ?? ''; }
test('submitted hostnames are inert text; only reviewed official sources are links', () => {
  const card = linkInspectionCard({ checkedAt: NOW, unicodeVersion: '18.0.0', findings: [{ hostname: 'evil.example', unicodeHostname: '<script>evil</script>', scripts: [], status: 'unconfirmed', matches: [] }] }, node);
  assert.match(text(card), /evil.example/);
  assert.match(text(card), /heuristic and incomplete/);
  assert.equal(flatten(card).filter(item => item.tag === 'a').length, 0);
});
test('outdated resources render as inert references with independent fallback, never a live provenance link', () => {
  const evidence = guidanceEvidence({ checkedAt: NOW, resources: [{ id: 'cert-report', purpose: 'general-contact', title: 'CERT general contact', region: 'Sri Lanka', scope: 'General enquiries', phone: '101', url: SOURCE.url, source: { ...SOURCE, reviewedAt: '2026-01-01' }, status: 'outdated' }] });
  const card = officialResourcesCard(evidence, [], node);
  assert.match(text(card), /not a dedicated fraud hotline/);
  assert.match(text(card), /Outdated reference/);
  assert.match(text(card), /independently trusted/);
  assert.match(text(card), /Official phone \(outdated reference\): 101/);
  assert.match(text(card), /Sri Lanka CERT reporting/);
  const links = flatten(card).filter(item => item.tag === 'a');
  assert.equal(links.length, 0, 'outdated provenance must not resurrect a withheld destination');
});
test('current link matches never print a literal null and retain a validated source link', () => {
  const link = { checkedAt: NOW, unicodeVersion: '18.0.0', limitations: [], truncated: false, findings: [{
    hostname: 'paypal.com', unicodeHostname: 'paypal.com', scripts: ['Latin'], status: 'possible-lookalike',
    matches: [{ organizationName: 'PayPal', officialDomain: 'paypal.com', source: SOURCE, outdated: false }],
  }] };
  const card = linkInspectionCard(link, node);
  assert.equal(text(card).includes('null'), false);
  assert.match(text(card), /Related record: PayPal/);
  assert.equal(flatten(card).filter(item => item.tag === 'a').length, 1);
});
