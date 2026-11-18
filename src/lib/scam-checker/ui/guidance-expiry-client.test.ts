import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGuidanceResources, GUIDANCE_DIRECTORY } from './guidance-directory.ts';
import { verifyOrganizationContacts } from './organization-verification.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';
import { guidanceEvidence } from './public/evidence.js';
import { ACTIONS, selectedActions } from './public/guidance.js';
import { createSummaryModel, summaryText } from './public/summary.js';

const NOW = Date.UTC(2026, 9, 31, 12);
const verification = verifyOrganizationContacts('', ORGANIZATION_DIRECTORY, NOW);
const all = ['clicked', 'shared', 'paid'];

function assertFallbackOnly(metadata: unknown, at = NOW) {
  const evidence = guidanceEvidence(metadata);
  assert.deepEqual(selectedActions(all, evidence.resources, evidence.actions), []);
  const model = createSummaryModel({ outcome: { analysisStatus: 'limited' }, guidanceResources: metadata }, 'PRIVATE_ORIGINAL', new Date(at).toISOString());
  const output = summaryText(model, all, ACTIONS.map(action => action.id));
  for (const action of ACTIONS) assert.equal(output.includes(action.text), false, `withheld action ${action.id} must not be resurrected`);
  assert.equal(output.includes('[x]'), false);
  assert.match(output, /No current, validated action guidance is available/);
  assert.match(output, /Fallback: Use an independently trusted official/);
  assert.equal(output.includes('PRIVATE_ORIGINAL'), false);
}

test('backend expiry on 2027-01-30 remains withheld through client selection and summary', () => {
  const later = Date.UTC(2027, 0, 30, 12);
  const metadata = getGuidanceResources(verification, GUIDANCE_DIRECTORY, later);
  assert.deepEqual(metadata.actions, [], 'backend correctly withholds expired actions');
  assertFallbackOnly(metadata, later);
});
test('future-reviewed backend guidance remains withheld through selection and summary', () => {
  const beforeReview = Date.UTC(2026, 9, 30, 12);
  const metadata = getGuidanceResources(verification, GUIDANCE_DIRECTORY, beforeReview);
  assert.deepEqual(metadata.actions, []);
  assertFallbackOnly(metadata, beforeReview);
});
test('backend action records without current resource references cannot enable canned guidance', () => {
  const noResources = getGuidanceResources(verification, [], NOW);
  assert.ok(noResources.actions.length);
  assert.ok(noResources.actions.every(action => !action.resourceIds.length));
  assertFallbackOnly(noResources);
  const futureResources = GUIDANCE_DIRECTORY.map(resource => ({ ...resource, source: { ...resource.source, reviewedAt: '2026-11-01' } }));
  assertFallbackOnly(getGuidanceResources(verification, futureResources, NOW));
});
test('missing, empty or invalid action metadata uses only the explicit trusted-channel fallback', () => {
  const current = getGuidanceResources(verification, GUIDANCE_DIRECTORY, NOW);
  for (const metadata of [undefined, {}, { ...current, actions: undefined }, { ...current, actions: [] },
    { ...current, actions: current.actions.map(action => ({ ...action, exposures: [] })) },
    { ...current, actions: current.actions.map(action => ({ ...action, exposures: ['unknown'] })) },
    { ...current, actions: current.actions.map(action => ({ ...action, resourceIds: [] })) },
    { ...current, actions: current.actions.map(action => ({ ...action, priority: NaN })) },
    { ...current, actions: current.actions.map(action => ({ ...action, text: '' })) },
    { ...current, resources: current.resources.map(resource => ({ ...resource, purpose: 'general-contact' })) },
    { ...current, resources: current.resources.map(resource => ({ ...resource, source: { ...resource.source, reviewedAt: '2026-11-01' } })) },
    { ...current, resources: current.resources.map(resource => ({ ...resource, source: { ...resource.source, url: 'https://evil.lk/' } })) },
  ]) assertFallbackOnly(metadata);
  assert.deepEqual(selectedActions(all), [], 'omitted metadata is not approval');
});
test('partial approval gates each canned action and the urgent shared/paid step independently', () => {
  const current = getGuidanceResources(verification, GUIDANCE_DIRECTORY, NOW);
  for (const [id, selected, rejected] of [
    ['protect-exposed-information', 'shared', 'paid'], ['contact-payment-provider', 'paid', 'shared'],
  ]) {
    const evidence = guidanceEvidence({ ...current, actions: current.actions.filter(action => action.id === id) });
    assert.equal(selectedActions([selected], evidence.resources, evidence.actions)[0]?.id, 'contact-bank');
    assert.equal(selectedActions([rejected], evidence.resources, evidence.actions).some(action => action.id === 'contact-bank'), false);
  }
  const reportOnly = guidanceEvidence({ ...current, actions: current.actions.filter(action => action.id === 'report-lk-incident') });
  assert.deepEqual(selectedActions(all, reportOnly.resources, reportOnly.actions).map(action => action.id), ['report']);
});
test('current reviewed backend guidance preserves all nine states and all seven modern action IDs', () => {
  const evidence = guidanceEvidence(getGuidanceResources(verification, GUIDANCE_DIRECTORY, NOW));
  const states = [[], ['received'], ['clicked'], ['shared'], ['paid'], ['clicked', 'shared'], ['clicked', 'paid'], ['shared', 'paid'], all];
  for (const exposures of states) {
    const actions = selectedActions(exposures, evidence.resources, evidence.actions);
    assert.equal(actions[0]?.id, exposures.includes('shared') || exposures.includes('paid') ? 'contact-bank' : 'pause');
    assert.equal(actions.some(action => action.id === 'secure-accounts'), exposures.includes('shared'));
    assert.equal(actions.some(action => action.id === 'check-device'), exposures.includes('clicked'));
    assert.equal(actions.some(action => action.id === 'payment-evidence'), exposures.includes('paid'));
    assert.ok(actions.some(action => action.id === 'verify-independently'));
    assert.ok(actions.some(action => action.id === 'report'));
  }
  assert.deepEqual(selectedActions(all, evidence.resources, evidence.actions).map(action => action.id), ACTIONS.map(action => action.id));
});
