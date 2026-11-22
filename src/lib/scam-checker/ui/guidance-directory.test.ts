import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDANCE_DIRECTORY, GUIDANCE_FALLBACK, getGuidanceResources } from './guidance-directory.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';
import { verifyOrganizationContacts, isFresh } from './organization-verification.ts';
import { inspectLinks } from './link-inspection.ts';

const NOW = Date.UTC(2026, 10, 20, 12);
const verification = (text = '') => verifyOrganizationContacts(text, ORGANIZATION_DIRECTORY, NOW);
const REFRESHED = GUIDANCE_DIRECTORY.filter(record => record.source.reviewedAt === '2026-11-10');

test('separate guidance catalog uses stable IDs, known organizations, official HTTPS and complete review metadata', () => {
  assert.equal(new Set(GUIDANCE_DIRECTORY.map(record => record.id)).size, GUIDANCE_DIRECTORY.length);
  for (const record of GUIDANCE_DIRECTORY) {
    assert.ok(record.title && record.region && record.scope && record.source.context && record.source.title);
    assert.equal(isFresh(record.source, NOW), true);
    assert.equal(new URL(record.source.url).protocol, 'https:');
    assert.ok(record.url || record.phone);
    if (record.url) assert.equal(new URL(record.url).protocol, 'https:');
    if (record.organizationId) assert.ok(ORGANIZATION_DIRECTORY.some(org => org.id === record.organizationId));
  }
  assert.deepEqual(new Set(ORGANIZATION_DIRECTORY.map(org => org.kind)), new Set(['bank', 'payment', 'delivery', 'technology', 'utility', 'government', 'commerce']));
});

test('10 November refreshed records use their own review date and expire at the documented 90-day boundary', () => {
  assert.deepEqual(REFRESHED.map(record => record.id), ['boc-fraud-awareness', 'combank-security-measures', 'dhl-fraud-awareness']);
  for (const record of REFRESHED) {
    // Only facts published on the reviewed page: the record links that page and infers no phone.
    assert.equal(record.url, record.source.url);
    assert.equal(record.phone, undefined);
    assert.equal(isFresh(record.source, NOW), true);
    // 90 days after 2026-11-10T00:00Z is 2027-02-08T00:00Z: fresh at exactly 90 days, stale 1 ms later.
    assert.equal(isFresh(record.source, Date.UTC(2027, 1, 8, 0)), true);
    assert.equal(isFresh(record.source, Date.UTC(2027, 1, 8, 0) + 1), false);
  }
  // The carried-forward 31 October records keep their own review date and a shorter window.
  const carried = GUIDANCE_DIRECTORY.find(record => record.id === 'lk-cert-report')!;
  assert.equal(carried.source.reviewedAt, '2026-10-31');
  assert.equal(isFresh(carried.source, Date.UTC(2027, 0, 29, 0)), true);
  assert.equal(isFresh(carried.source, Date.UTC(2027, 0, 29, 0) + 1), false);
});

test('unknown and contact-free messages receive general recovery/security and Sri Lankan reporting resources', () => {
  const result = getGuidanceResources(verification('Unlisted company invitation'), GUIDANCE_DIRECTORY, NOW);
  assert.ok(result.resources.some(resource => resource.id === 'lk-cert-report' && resource.region === 'LK'));
  assert.ok(result.resources.some(resource => resource.purpose === 'recovery'));
  assert.ok(result.resources.every(resource => !resource.organizationId));
  assert.equal(result.fallback, GUIDANCE_FALLBACK);
});

test('only relevant organization resources are added, preserving purpose and region', () => {
  const result = getGuidanceResources(verification('PayPal and EDL account message'), GUIDANCE_DIRECTORY, NOW);
  assert.deepEqual(result.resources.filter(resource => resource.organizationId).map(resource => resource.organizationId), ['paypal', 'edl']);
  assert.equal(result.resources.find(resource => resource.organizationId === 'paypal')?.region, 'US');
  assert.equal(result.resources.find(resource => resource.organizationId === 'edl')?.purpose, 'general-contact');
  assert.ok(result.resources.filter(resource => resource.organizationId).every(resource => resource.organizationName));
});

test('lookalike-only comparisons can add relevant help without asserting sender identity', () => {
  const text = 'Check https://g00gle.com';
  const verified = verification(text);
  assert.equal(verified.organizations.length, 0);
  const result = getGuidanceResources(verified, GUIDANCE_DIRECTORY, NOW, inspectLinks(text, ORGANIZATION_DIRECTORY, NOW));
  assert.ok(result.resources.some(resource => resource.organizationId === 'google'));
  assert.ok(result.limitations.some(limit => limit.includes('not sender authentication')));
});

test('stale, future and invalid resource review dates never expose current actionable destinations', () => {
  for (const reviewedAt of ['2026-01-01', '2026-11-21', '2026-02-30', 'invalid']) {
    const stale = GUIDANCE_DIRECTORY.map(record => ({ ...record, source: { ...record.source, reviewedAt } }));
    const result = getGuidanceResources(verification('Google'), stale, NOW);
    assert.ok(result.resources.every(resource => resource.status === 'outdated'));
    assert.ok(result.resources.every(resource => !('url' in resource) && !('phone' in resource)));
    assert.ok(result.resources.every(resource => resource.source.reviewedAt === reviewedAt));
    assert.ok(result.limitations.some(limit => limit.includes('withheld')));
    assert.ok(result.limitations.some(limit => limit.includes('No current reviewed guidance resource')));
    assert.ok(result.actions.every(action => action.resourceIds.length === 0));
    assert.equal(result.fallback, GUIDANCE_FALLBACK);
  }
});

test('missing guidance records do not promote identity/head-office facts into recovery authority', () => {
  const result = getGuidanceResources(verification('Bank of Ceylon'), [], NOW);
  assert.deepEqual(result.resources, []);
  assert.ok(result.limitations.some(limit => limit.includes('No current reviewed guidance resource')));
  assert.equal(JSON.stringify(result).includes('+94112446790'), false);
  assert.match(result.fallback, /independently obtained/);
});

test('general contacts are never relabelled as dedicated fraud hotlines', () => {
  const result = getGuidanceResources(verification('People’s Bank and EDL'), GUIDANCE_DIRECTORY, NOW);
  const scoped = result.resources.filter(resource => resource.phone && resource.organizationId);
  assert.ok(scoped.every(resource => resource.purpose === 'general-contact'));
  assert.ok(scoped.every(resource => /not .*fraud hotline/i.test(resource.scope!)));
  assert.ok(result.limitations.some(limit => limit.includes('head-office numbers are not dedicated fraud hotlines')));
});

test('reviewed action metadata covers every exposure, is ordered and only references current returned resources', () => {
  const result = getGuidanceResources(verification('Apple'), GUIDANCE_DIRECTORY, NOW);
  assert.deepEqual(new Set(result.actions.flatMap(action => action.exposures)), new Set(['received', 'clicked', 'shared', 'paid']));
  assert.equal(new Set(result.actions.map(action => action.id)).size, result.actions.length);
  assert.deepEqual(result.actions.map(action => action.priority), [...result.actions.map(action => action.priority)].sort((a, b) => a - b));
  for (const action of result.actions) assert.ok(action.resourceIds.every(id => result.resources.some(resource => resource.id === id && resource.status === 'current')));
  assert.match(result.actions.find(action => action.id === 'contact-payment-provider')!.text, /recovery is not guaranteed/);
  assert.match(result.actions.find(action => action.id === 'close-suspect-page')!.text, /Clicking alone does not prove/);
  assert.match(result.actions.find(action => action.id === 'protect-exposed-information')!.text, /OTP, PIN/);
});

test('expired reviewed actions are withheld and do not leave stale-resource dependencies', () => {
  const later = NOW + 91 * 86_400_000;
  const result = getGuidanceResources(verification('Google'), GUIDANCE_DIRECTORY, later);
  assert.deepEqual(result.actions, []);
  assert.ok(result.resources.every(resource => resource.status === 'outdated' && !resource.url && !resource.phone));
  assert.ok(result.limitations.some(limit => limit.includes('action guidance')));
  assert.equal(result.fallback, GUIDANCE_FALLBACK);
});

test('results are isolated values; client-side mutation cannot corrupt catalog or later requests', () => {
  const first = getGuidanceResources(verification('Google'), GUIDANCE_DIRECTORY, NOW);
  const snapshot = getGuidanceResources(verification('Google'), GUIDANCE_DIRECTORY, NOW);
  first.resources[0].source.reviewedAt = '1900-01-01';
  first.actions[0].exposures.push('received');
  first.actions[0].resourceIds.push('forged');
  assert.deepEqual(getGuidanceResources(verification('Google'), GUIDANCE_DIRECTORY, NOW), snapshot);
});
