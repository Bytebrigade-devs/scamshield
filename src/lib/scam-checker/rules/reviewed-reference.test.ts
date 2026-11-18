/**
 * Self-consistency checks for the reviewed URL-shape reference (R-M4-21…23).
 *
 * The full drift guard against the reviewed organization directory lives in the owner's M4
 * workspace (`code/ui/reviewed-reference.test.ts`), because that directory is not part of this
 * repository slice. This test only pins the projection's internal consistency so the library
 * remains publishable and reviewable on its own.
 *
 * Runner: Node built-in `node --test` (zero dependencies), matching the M4 library workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEWED_BRANDS, REVIEWED_TWO_LEVEL_SUFFIXES, SPELLING_REFERENCES, isReviewedOfficialHost,
  isSingleEditApart, registrableDomain, subdomainDepth,
} from './reviewed-reference.ts';

test('reviewed projection is internally consistent (unique ids, hosts and aliases)', () => {
  const ids = new Set<string>();
  for (const brand of REVIEWED_BRANDS) {
    assert.ok(!ids.has(brand.organizationId), `duplicate organization id: ${brand.organizationId}`);
    ids.add(brand.organizationId);
    assert.ok(brand.aliases.length > 0, brand.organizationId);
    assert.ok(brand.officialHosts.length > 0, brand.organizationId);
    for (const host of brand.officialHosts) {
      assert.match(host, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, `${brand.organizationId}: ${host}`);
    }
  }
});

test('projected officialDomains are exactly the registrable domains derived from official hosts', () => {
  for (const brand of REVIEWED_BRANDS) {
    const derived = [...new Set(brand.officialHosts.map(host => registrableDomain(host)))].sort();
    assert.deepEqual([...brand.officialDomains].sort(), derived, brand.organizationId);
  }
});

test('the documented two-level suffix list stays small and explicit (not a PSL claim)', () => {
  assert.ok(REVIEWED_TWO_LEVEL_SUFFIXES.length >= 9);
  assert.ok(REVIEWED_TWO_LEVEL_SUFFIXES.length <= 40);
  for (const suffix of REVIEWED_TWO_LEVEL_SUFFIXES) assert.match(suffix, /^[a-z]{2,4}\.[a-z]{2}$/);
});

test('depth arithmetic and official-host matching behave as documented', () => {
  assert.equal(subdomainDepth('sampath.lk'), 0);
  assert.equal(subdomainDepth('www.sampath.lk'), 1);
  assert.equal(subdomainDepth('a.b.c.sampath.lk'), 3);
  assert.equal(subdomainDepth('a.b.c.example.co.uk'), 3);
  assert.equal(registrableDomain('edlcare.edl.lk'), 'edl.lk');
  assert.equal(isReviewedOfficialHost('www.sampath.lk'), true);
  assert.equal(isReviewedOfficialHost('login.sampath.lk'), true);
  assert.equal(isReviewedOfficialHost('sampath.lk.example.com'), false);
});

test('spelling references are brand-like (long labels on normal public suffixes) and distance-bounded', () => {
  assert.ok(SPELLING_REFERENCES.length >= 6);
  for (const reference of SPELLING_REFERENCES) {
    assert.ok(reference.label.length >= 6, reference.label);
    assert.ok(!reference.label.includes('-'), reference.label);
    assert.ok(/\.(?:com|net|org|lk|edu|gov|info|io|co)$/.test(reference.officialDomain), reference.officialDomain);
  }
  assert.equal(isSingleEditApart('sampath', 'sampath'), false);
  assert.equal(isSingleEditApart('sampath', 'sampat'), true);
  assert.equal(isSingleEditApart('sampath', 'smapath'), true);
  assert.equal(isSingleEditApart('sampath', 'sampathxy'), false);
});
