/** Deliberate allowlist projection: raw messages, senders and AI prose never enter this model. */
import { categoryLabel, deepFreeze, localPatterns, riskAssessment } from './assessment.js';
import { reviewedSource } from './organization-card.js';
import { checkedTimestamp, guidanceEvidence, label, linkEvidence, LINK_LABELS, PURPOSE_LABELS, safeName, sourceIsCurrent, TRUSTED_CHANNEL_FALLBACK } from './evidence.js';
import { EXPOSURE_LABELS, normalizeExposures, relevantResources, selectedActions } from './guidance.js';

const STATUS_LABELS = { completed: 'Completed', limited: 'Limited — local patterns only', unavailable: 'Unavailable — local patterns only' };
const LINK_LIMIT = 'Offline hostname comparison only. No submitted link was opened, fetched, resolved or checked for reputation. Lookalike detection is heuristic and incomplete, limited to Latin, Greek, Cyrillic, Common and Inherited scripts; a match does not establish safety or sender authenticity.';
const GENERAL_LIMIT = 'Guidance is not a guarantee of safety. Directory and regional coverage are incomplete. Confirm purpose, region and freshness independently.';
const items = value => Array.isArray(value) ? value.slice(0, 64) : [];
function metadata(value, fallback) {
  const result = label(value, 240);
  return result && !/(?:https?:|www\.|@|\+?\d[\d ()-]{7,}\d)/i.test(result) ? result : fallback;
}
function sourceModel(source, checkedAt) {
  const approved = reviewedSource(source);
  return approved ? { url: approved.url, reviewedAt: approved.reviewedAt, outdated: !sourceIsCurrent(approved, checkedAt) } : null;
}
export function createSummaryModel(payload, submittedText, at) {
  const checkedAt = checkedTimestamp(at);
  if (!checkedAt) throw new TypeError('A fixed check timestamp is required');
  const outcome = payload?.outcome ?? {};
  const status = Object.hasOwn(STATUS_LABELS, outcome.analysisStatus) ? outcome.analysisStatus : 'unavailable';
  const link = linkEvidence(payload?.linkInspection);
  const guidance = guidanceEvidence(payload?.guidanceResources);
  const sources = new Map();
  const addSource = value => {
    const source = sourceModel(value, checkedAt);
    if (source) sources.set(`${source.url}|${source.reviewedAt}`, source);
  };
  const organizations = items(payload?.organizationVerification?.organizations).flatMap(organization => {
    const name = safeName(organization?.name);
    if (!name) return [];
    const source = sourceModel(organization.identity?.source, checkedAt);
    const supported = source && ['matched', 'outdated'].includes(organization.identity?.status);
    if (supported) addSource(organization.identity.source);
    const status = !supported ? 'Record not confirmed' : source.outdated || organization.identity.status === 'outdated'
      ? 'Outdated official record' : 'Official-source record; sender unconfirmed';
    const contactCounts = new Map();
    const contacts = items(organization.contacts).filter(contact => ['phone', 'website'].includes(contact?.kind)).map(contact => {
      const matches = items(contact.matches).filter(match => reviewedSource(match?.source));
      matches.forEach(match => addSource(match.source));
      const confirmed = matches.length && ['matched', 'another-organization', 'outdated'].includes(contact.status);
      const kind = contact.kind === 'phone' ? 'Phone' : 'Website';
      const sequence = (contactCounts.get(kind) ?? 0) + 1;
      contactCounts.set(kind, sequence);
      return { kind, label: `${kind} ${sequence}`, status: contact.status === 'not-provided' ? 'Not provided'
        : confirmed ? contact.status === 'outdated' || matches.some(match => !sourceIsCurrent(match.source, checkedAt))
          ? 'Outdated record' : contact.status === 'another-organization' ? 'Listed for a different organization' : 'Matches a reviewed record; not authentication'
          : 'Not confirmed' };
    });
    items(organization.officialContacts).forEach(contact => addSource(contact?.source));
    return [{ name, status, contacts }];
  });
  const links = { available: link.available, checkedAt: link.checkedAt, limited: link.limited,
    findings: link.findings.map(finding => ({ status: finding.status, matches: finding.matches.map(match => {
      addSource(match.source);
      return { organizationName: match.organizationName, outdated: match.outdated };
    }) })) };
  const resources = guidance.resources.map(resource => ({
    id: resource.id, purpose: resource.purpose, organizationName: resource.organizationName,
    region: metadata(resource.region, 'Region not confirmed'), scope: metadata(resource.scope, 'Scope not supplied; verify with official source'),
    url: resource.url, phone: resource.phone, status: resource.status,
    source: sourceModel(resource.source, checkedAt),
  }));
  const limitations = [LINK_LIMIT, GENERAL_LIMIT];
  if (status !== 'completed') limitations.push('No AI risk assessment is available for this check. Local patterns can miss scams and can flag legitimate messages.');
  if (!link.available) limitations.push('Link-inspection metadata was not available in this response.');
  else if (link.limited) limitations.push('Link inspection has coverage limits or truncated findings.');
  if (!guidance.available) limitations.push('Official-resource metadata was not available in this response.');
  else if (guidance.limited) limitations.push('Some resource metadata was limited or could not be validated.');
  if (resources.some(resource => resource.status === 'outdated')) limitations.push('Outdated resources are references only; use an independently trusted official channel.');
  return deepFreeze({ checkedAt, status, risk: riskAssessment({ ...outcome, analysisStatus: status }).label,
    category: categoryLabel(outcome.category), patterns: localPatterns(submittedText, outcome.rules?.matches),
    organizations, links, guidanceAvailable: guidance.available, resources, actions: guidance.actions, sources: [...sources.values()], limitations });
}

/** One canonical string drives preview, clipboard, UTF-8 TXT and print. */
export function summaryText(model, answers = []) {
  const exposures = normalizeExposures(answers);
  const resources = relevantResources(model.resources, exposures);
  const actions = selectedActions(exposures, resources, model.actions);
  const lines = ['ScamShield check summary', `Check time (UTC): ${model.checkedAt}`, `Analysis: ${STATUS_LABELS[model.status]}`,
    `Risk: ${model.risk}`, `Category: ${model.category}`, `Local patterns found: ${model.patterns.count}`,
    ...model.patterns.reasons.map(reason => `- ${reason}`), '', 'Organization / contact evidence'];
  if (!model.organizations.length) lines.push('No source-backed organization evidence available.');
  for (const organization of model.organizations) {
    lines.push(`- ${organization.name}: ${organization.status}`);
    organization.contacts.forEach(contact => lines.push(`  ${contact.label}: ${contact.status}`));
  }
  lines.push('', 'Link evidence (submitted addresses omitted)');
  if (!model.links.available) lines.push('Not available for this response.');
  else if (!model.links.findings.length) lines.push('No inspectable link findings supplied. This does not establish safety.');
  else model.links.findings.forEach((finding, index) => {
    lines.push(`- Link ${index + 1}: ${LINK_LABELS[finding.status]}`);
    finding.matches.forEach(match => lines.push(`  Related official record: ${match.organizationName}${match.outdated ? ' — outdated' : ''}`));
  });
  lines.push('', 'Your selected answers', exposures.length ? exposures.map(value => EXPOSURE_LABELS[value]).join('; ') : 'Not answered — general guidance only.', '', 'Suggested actions');
  if (!actions.length) lines.push('No current, validated action guidance is available. Use the trusted-channel fallback below.');
  actions.forEach(action => lines.push(`- ${action.text}`));
  lines.push('', 'Official resources');
  if (!resources.length) lines.push('No validated resource available for these selections.');
  for (const resource of resources) {
    lines.push(`- ${PURPOSE_LABELS[resource.purpose]}${resource.organizationName ? ` — ${resource.organizationName}` : ''}`,
      `  Region: ${resource.region}; scope: ${resource.scope}`,
      `  Status: ${resource.status === 'current' ? 'Current at check time' : 'Outdated — independently recheck before use'}`);
    if (resource.url) lines.push(`  Official website: ${resource.url}`);
    if (resource.phone) lines.push(`  Official phone: ${resource.phone}`);
    if (resource.source) lines.push(`  Official source: ${resource.source.url} (reviewed ${resource.source.reviewedAt})`);
  }
  lines.push(`Fallback: ${TRUSTED_CHANNEL_FALLBACK}`, '', 'Other official evidence sources');
  if (!model.sources.length) lines.push('No validated official evidence sources available.');
  model.sources.forEach(source => lines.push(`- Official source: ${source.url} (reviewed ${source.reviewedAt}${source.outdated ? '; outdated' : ''})`));
  lines.push('', 'Limitations', ...model.limitations.map(value => `- ${value}`), '',
    'Review before sharing: this summary includes organization names and your selected answers. The original message, sender details and AI explanation are not included.',
    'Selections stay in this page’s browser memory only and reset for a new check. Copying, downloading or printing creates a separate copy you control. This is not an automatic redaction service.');
  return lines.join('\n');
}
export function summaryFilename(model) {
  return `scamshield-summary-${model.checkedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}.txt`;
}
