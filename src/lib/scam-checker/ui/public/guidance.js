/** Exposure answers and guidance are browser-memory values, never network or storage inputs. */
import { deepFreeze } from './assessment.js';
export const EXPOSURE_LABELS = Object.freeze({
  received: 'Only received it', clicked: 'Clicked a link', shared: 'Shared information', paid: 'Sent money',
});
const MULTI = ['clicked', 'shared', 'paid'];
export function normalizeExposures(values) {
  const list = Array.isArray(values) ? values : [];
  const selected = MULTI.filter(value => list.includes(value));
  return selected.length ? selected : list.includes('received') ? ['received'] : [];
}
export function toggleExposure(values, value, checked) {
  const current = normalizeExposures(values);
  if (!Object.hasOwn(EXPOSURE_LABELS, value)) return current;
  if (value === 'received') return checked ? ['received'] : [];
  return normalizeExposures(checked ? [...current.filter(item => item !== 'received'), value] : current.filter(item => item !== value));
}
// Approved canned actions prevent submitted wording or arbitrary API explanations entering an export.
export const ACTIONS = deepFreeze([
  { id: 'contact-bank', priority: 0, exposures: ['shared', 'paid'], purposes: ['recovery'], text: 'If you shared banking or payment details, or sent money, contact your own bank or payment provider immediately using its trusted app, your card or an independently verified official channel. Ask about securing the account and stopping or recalling payment. A bank named in the message may not be your bank.' },
  { id: 'pause', priority: 10, exposures: [], purposes: ['security'], text: 'Pause. Do not reply, follow message links, send more money or share passwords or one-time codes.' },
  { id: 'secure-accounts', priority: 20, exposures: ['shared'], purposes: ['recovery', 'security'], text: 'If you shared a password or account access, change it through the service’s trusted app or independently visited official website. Change reused passwords, review active sessions and enable multi-factor authentication.' },
  { id: 'check-device', priority: 30, exposures: ['clicked'], purposes: ['security'], text: 'Close the linked page. If you downloaded or installed anything, stop using it and seek trusted device-security help. Update your device and run its trusted security checks; clicking alone does not prove infection.' },
  { id: 'payment-evidence', priority: 40, exposures: ['paid'], purposes: ['recovery'], text: 'Keep payment references and relevant evidence privately for your bank or payment provider. Do not pay anyone promising guaranteed recovery.' },
  { id: 'verify-independently', priority: 50, exposures: [], purposes: ['general-contact', 'security'], text: 'Verify any claim using contact details you already trust or an independently found official website or app, not a link or number in the message.' },
  { id: 'report', priority: 60, exposures: [], purposes: ['reporting'], text: 'Consider reporting through the relevant official service or local authority. Check the resource’s purpose, region and scope first. Nothing is reported automatically.' },
]);
const RESOURCE_ACTION_IDS = Object.freeze({
  pause: 'verify-independently', 'secure-accounts': 'protect-exposed-information',
  'check-device': 'close-suspect-page', 'payment-evidence': 'contact-payment-provider',
  'verify-independently': 'verify-independently', report: 'report-lk-incident',
});
export const REVIEWED_ACTION_IDS = Object.freeze([...new Set(Object.values(RESOURCE_ACTION_IDS))]);
const REVIEWED_ACTION_PURPOSES = deepFreeze({
  'contact-payment-provider': ['recovery'], 'protect-exposed-information': ['recovery', 'security'],
  'close-suspect-page': ['security'], 'verify-independently': ['security'], 'report-lk-incident': ['reporting'],
});
export function selectedActions(values, resources = [], reviewedActions = null) {
  const exposures = normalizeExposures(values);
  if (!Array.isArray(reviewedActions) || !Array.isArray(resources)) return [];
  function approved(id, requiredExposure = null) {
    const reviewed = reviewedActions.find(item => item?.id === id);
    if (!reviewed || !Array.isArray(reviewed.exposures) || !reviewed.exposures.length
      || reviewed.exposures.some(value => !Object.hasOwn(EXPOSURE_LABELS, value))
      || !Array.isArray(reviewed.resourceIds) || !reviewed.resourceIds.length) return [];
    const applies = requiredExposure ? reviewed.exposures.includes(requiredExposure)
      : exposures.length ? exposures.some(value => reviewed.exposures.includes(value))
        : Object.keys(EXPOSURE_LABELS).every(value => reviewed.exposures.includes(value));
    if (!applies) return [];
    return resources.filter(resource => resource?.status === 'current'
      && REVIEWED_ACTION_PURPOSES[id]?.includes(resource.purpose) && reviewed.resourceIds.includes(resource.id)).map(resource => resource.id);
  }
  return ACTIONS.flatMap(action => {
    if (action.exposures.length && !action.exposures.some(value => exposures.includes(value))) return [];
    // Every canned action needs current server approval AND a current supporting resource.
    // The urgent conditional step is never inferred merely from selecting shared/paid.
    if (action.id === 'contact-bank') {
      const allowed = exposures.includes('shared') && approved('protect-exposed-information', 'shared').length
        || exposures.includes('paid') && approved('contact-payment-provider', 'paid').length;
      return allowed ? [{ ...action, resourceIds: [] }] : [];
    }
    const requiredExposure = action.exposures.length === 1 ? action.exposures[0] : null;
    const resourceIds = approved(RESOURCE_ACTION_IDS[action.id], requiredExposure);
    return resourceIds.length ? [{ ...action, resourceIds }] : [];
  });
}
export function relevantResources(resources, values) {
  const exposures = normalizeExposures(values);
  return resources.filter(resource => resource.purpose !== 'recovery' || exposures.includes('shared') || exposures.includes('paid'));
}
