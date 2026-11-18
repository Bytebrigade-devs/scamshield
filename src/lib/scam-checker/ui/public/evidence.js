/** Strict browser boundary for additive backend metadata. No submitted link is navigable. */
import { sanitizeCandidate } from './render-safe.js';
import { reviewedSource } from './organization-card.js';
import { EXPOSURE_LABELS, REVIEWED_ACTION_IDS } from './guidance.js';

export const TRUSTED_CHANNEL_FALLBACK = 'Use an independently trusted official website, app or contact details you already know. Do not use contact details from the suspicious message. If money or banking details are involved, contact your own bank or payment provider first.';
export const LINK_LABELS = Object.freeze({
  'official-match': 'Hostname matches a reviewed official record',
  'possible-lookalike': 'Possible lookalike — review carefully',
  unconfirmed: 'Hostname not confirmed',
  'not-inspectable': 'Hostname could not be compared',
});
export const PURPOSE_LABELS = Object.freeze({ security: 'Security guidance', recovery: 'Account / payment recovery', reporting: 'Incident reporting', 'general-contact': 'General contact — not a dedicated fraud hotline' });
export function label(value, max = 180) {
  return typeof value === 'string' ? sanitizeCandidate(value).slice(0, max) : '';
}
export function safeName(value) {
  const name = label(value, 100);
  // Names are summary metadata, not a way to smuggle submitted URLs, phones or prose into exports.
  return name && !/[<>@/:\\\d\n\r]/.test(name) && !/\.[a-z]{2,}(?:\b|$)/i.test(name) ? name : '';
}
export function checkedTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19) ? new Date(time).toISOString() : null;
}
/**
 * Local, human-readable form of an instant. Exported summaries keep the UTC ISO value; on-screen
 * labels use this so no raw machine timestamp is shown to the reader. One formatter for the whole UI,
 * so check times, history rows and evidence snapshots cannot drift apart.
 */
const LOCAL_TIME_FORMAT = Object.freeze({
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});
export function formatCheckTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', LOCAL_TIME_FORMAT) : null;
}
export function checkedAtLabel(value) {
  const checked = checkedTimestamp(value);
  return checked ? formatCheckTime(checked) : null;
}
export function sourceIsCurrent(source, checkedAt) {
  const checked = Date.parse(checkedAt);
  const reviewed = Date.parse(`${source?.reviewedAt}T00:00:00Z`);
  return Number.isFinite(checked) && Number.isFinite(reviewed) && checked >= reviewed && checked - reviewed <= 90 * 86400000;
}
const lists = value => Array.isArray(value) ? value.slice(0, 64) : [];
export function linkEvidence(data) {
  const checkedAt = checkedTimestamp(data?.checkedAt);
  if (!checkedAt || !Array.isArray(data?.findings)) return { available: false, checkedAt: null, findings: [], limited: true };
  const findings = lists(data.findings).filter(item => item && Object.hasOwn(LINK_LABELS, item.status)
    && typeof item.hostname === 'string' && typeof item.unicodeHostname === 'string').map(item => {
    const matches = lists(item.matches).flatMap(match => {
      const source = reviewedSource(match?.source);
      const organizationName = safeName(match?.organizationName);
      if (!source || !organizationName || typeof match.outdated !== 'boolean'
        || typeof match.officialDomain !== 'string' || !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i.test(match.officialDomain)) return [];
      return [{ organizationName, officialDomain: label(match.officialDomain), source,
        outdated: match.outdated || !sourceIsCurrent(source, checkedAt) }];
    });
    const confirmed = matches.some(match => !match.outdated);
    const status = item.status === 'official-match' && !confirmed ? 'unconfirmed'
      : item.status === 'possible-lookalike' && !matches.length ? 'unconfirmed' : item.status;
    return { hostname: label(item.hostname, 300), unicodeHostname: label(item.unicodeHostname, 300), status, matches,
      scripts: lists(item.scripts).filter(script => typeof script === 'string').map(script => label(script, 40)) };
  });
  return { available: true, checkedAt, findings,
    unicodeVersion: typeof data.unicodeVersion === 'string' && /^\d+(?:\.\d+){0,2}$/.test(data.unicodeVersion) ? data.unicodeVersion : null,
    limited: data.truncated === true || lists(data.limitations).length > 0 || findings.length !== data.findings.length };
}
export function guidanceEvidence(data) {
  const checkedAt = checkedTimestamp(data?.checkedAt);
  if (!checkedAt || !Array.isArray(data?.resources)) return { available: false, checkedAt: null, resources: [], actions: [], limited: true, fallback: TRUSTED_CHANNEL_FALLBACK };
  const resources = lists(data.resources).flatMap(item => {
    const source = reviewedSource(item?.source);
    if (!source || !Object.hasOwn(PURPOSE_LABELS, item?.purpose) || !['current', 'outdated'].includes(item.status)
      || typeof item.id !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(item.id)
      || !label(item.title) || !label(item.region)) return [];
    const candidate = typeof item.url === 'string' ? reviewedSource({ ...source, url: item.url }) : null;
    const phone = typeof item.phone === 'string' && /^\+?[\d ()-]{3,30}$/.test(item.phone) ? item.phone : null;
    if ((item.url !== undefined && !candidate) || (item.phone !== undefined && !phone)) return [];
    const current = item.status === 'current' && sourceIsCurrent(source, checkedAt);
    return [{ id: item.id, organizationName: safeName(item.organizationName), purpose: item.purpose,
      title: label(item.title), region: label(item.region), scope: label(item.scope),
      url: candidate?.url ?? null, phone, source, status: current ? 'current' : 'outdated' }];
  });
  const actions = Array.isArray(data.actions) ? lists(data.actions).flatMap(action => {
    if (!action || !REVIEWED_ACTION_IDS.includes(action.id)
      || !Array.isArray(action.resourceIds) || !Array.isArray(action.exposures) || !action.exposures.length
      || action.exposures.some(value => !Object.hasOwn(EXPOSURE_LABELS, value))
      || !Number.isFinite(action.priority) || typeof action.text !== 'string' || !action.text.trim()) return [];
    const resourceIds = action.resourceIds.filter(id => resources.some(resource => resource.id === id && resource.status === 'current'));
    return resourceIds.length ? [{ id: action.id, exposures: [...new Set(action.exposures)], resourceIds }] : [];
  }) : [];
  return { available: true, checkedAt, resources: [...new Map(resources.map(item => [item.id, item])).values()], actions,
    limited: lists(data.limitations).length > 0 || resources.length !== data.resources.length,
    fallback: TRUSTED_CHANNEL_FALLBACK };
}
