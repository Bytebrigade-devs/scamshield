/**
 * Drift guard: the rule-engine reviewed projection must match the reviewed organization directory.
 *
 * `code/rules/reviewed-reference.ts` deliberately copies the reviewed brand aliases/hosts instead
 * of importing the browser-facing app layer (the rule engine has no app dependency). This test is
 * the contract that keeps the copy honest: a reviewed-directory change without a projection change
 * fails here. It is a repository/engineering check, not an authentication or accuracy claim.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';
import {
  REVIEWED_BRANDS, REVIEWED_TWO_LEVEL_SUFFIXES, SPELLING_REFERENCES, registrableDomain,
} from '../rules/reviewed-reference.ts';

const DIRECTORY_HOSTS = new Map(ORGANIZATION_DIRECTORY.map(org => [org.id, org.domains.map(domain => domain.value)]));

test('the reviewed projection covers exactly the reviewed directory organizations', () => {
  assert.deepEqual(REVIEWED_BRANDS.map(brand => brand.organizationId).sort(), [...DIRECTORY_HOSTS.keys()].sort());
});

test('projected official hosts and aliases are identical to the reviewed directory records', () => {
  for (const brand of REVIEWED_BRANDS) {
    const directoryHosts = DIRECTORY_HOSTS.get(brand.organizationId);
    assert.ok(directoryHosts, brand.organizationId);
    assert.deepEqual([...brand.officialHosts].sort(), [...directoryHosts].sort(), brand.organizationId);
    const directoryOrg = ORGANIZATION_DIRECTORY.find(org => org.id === brand.organizationId);
    assert.ok(directoryOrg, brand.organizationId);
    assert.deepEqual([...brand.aliases], [...directoryOrg.aliases], brand.organizationId);
  }
});

test('projected officialDomains are exactly the registrable domains derived from the reviewed hosts', () => {
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

test('spelling references are brand-like: long labels on normal public suffixes only', () => {
  assert.ok(SPELLING_REFERENCES.length >= 6);
  for (const reference of SPELLING_REFERENCES) {
    assert.ok(reference.label.length >= 6, reference.label);
    assert.ok(!reference.label.includes('-'), reference.label);
    assert.ok(/\.(?:com|net|org|lk|edu|gov|info|io|co)$/.test(reference.officialDomain), reference.officialDomain);
  }
});
