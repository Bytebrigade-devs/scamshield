import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySender } from './sender-verification.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';

const NOW = Date.UTC(2026, 9, 29, 6);
test('displayed organization names are never authenticated', () => {
  assert.deepEqual(verifySender('BOC', ORGANIZATION_DIRECTORY, NOW), { value: 'BOC', kind: 'name', status: 'not-confirmed', matches: [] });
});
test('sender phone normalization and exact email domains compare source-backed records', () => {
  const phone = verifySender('011 244 6790', ORGANIZATION_DIRECTORY, NOW);
  assert.equal(phone.status, 'matched');
  assert.equal(phone.matches[0].organizationId, 'bank-of-ceylon');
  const email = verifySender('service@boc.lk', ORGANIZATION_DIRECTORY, NOW);
  assert.equal(email.status, 'matched');
  assert.equal(email.kind, 'email');
  for (const sender of ['service@boc.lk.evil.com', 'BOC <agent@evil.com>', 'service@sub.boc.lk', 'service@bоc.lk']) {
    assert.equal(verifySender(sender, ORGANIZATION_DIRECTORY, NOW).status, 'not-confirmed', sender);
  }
});
test('expired sender record stays outdated and does not set a risk or authentication flag', () => {
  const result = verifySender('help@boc.lk', ORGANIZATION_DIRECTORY, Date.UTC(2027, 4, 1));
  assert.equal(result.status, 'outdated');
  assert.equal('senderAuthenticated' in result, false);
  assert.equal('riskLevel' in result, false);
});
