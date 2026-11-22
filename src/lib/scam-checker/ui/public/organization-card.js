/** Directory findings are server-generated evidence, separate from the AI assessment. */
import { sanitizeText } from './render-safe.js';

const STATUS_LABELS = {
  matched: 'Matches verified record',
  'not-confirmed': 'Not confirmed',
  'another-organization': 'Matches another organization’s record',
  outdated: 'Outdated record',
  'not-provided': 'Not provided',
};
const REVIEWED_SOURCE_HOSTS = [
  'cbsl.gov.lk', 'sampath.lk', 'boc.lk', 'combank.lk', 'hnb.net', 'peoplesbank.lk',
  'dhl.com', 'express.dhl', 'fedex.com', 'paypal.com', 'paypalobjects.com',
  'microsoft.com', 'google.com', 'apple.com', 'amazon.com', 'aboutamazon.com', 'edl.lk', 'ceb.lk',
  'cert.gov.lk', 'police.lk', 'consumer.ftc.gov',
  // Tier 1–3 expansion sources, reviewed 20 November 2026.
  'nsb.lk', 'seylan.lk', 'seylanbank.lk', 'dialog.lk', 'slt.lk', 'sltmobitel.lk', 'mobitel.lk',
  'leco.lk', 'ird.gov.lk', 'slpost.gov.lk', 'immigration.gov.lk', 'daraz.lk', 'kapruka.com',
  'whatsapp.com', 'telegram.org', 'westernunion.com', 'wise.com',
];
const WARNING = 'Matching official contact details does not authenticate the sender or prove the message is safe.';

function text(value) {
  return typeof value === 'string' ? sanitizeText(value) : '';
}

export function reviewedSource(source) {
  if (!source || typeof source !== 'object' || typeof source.url !== 'string'
      || typeof source.title !== 'string' || !source.title.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt)
      || !Number.isFinite(Date.parse(`${source.reviewedAt}T00:00:00Z`))
      || new Date(`${source.reviewedAt}T00:00:00Z`).toISOString().slice(0, 10) !== source.reviewedAt) return null;
  try {
    const url = new URL(source.url);
    const allowed = REVIEWED_SOURCE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) return null;
    return { ...source, url: url.href };
  } catch { return null; }
}

export function sourceDetails(source, el, live = false, linkable = true, compact = false) {
  const approved = reviewedSource(source);
  if (!approved) return null;
  const date = new Date(`${approved.reviewedAt}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return el('div', { class: 'organization-source' }, [
    // Compact mode drops the per-source context sentence: titles are shown once per record, not
    // repeated under every contact that cites the same source.
    !compact && approved.context ? el('p', { class: 'organization-source__context' }, text(approved.context)) : null,
    linkable ? el('a', {
      class: 'organization-source__link', href: approved.url, target: '_blank', rel: 'noopener noreferrer',
      'aria-label': `${text(approved.title)} (opens in a new tab)`,
    }, text(approved.title)) : el('p', { class: 'organization-source__title' }, text(approved.title)),
    el('p', { class: 'organization-source__date' }, `${live ? 'Source checked' : 'Reviewed'} ${date}`),
  ]);
}

/** One deduplicated reviewed-source list per record instead of a citation under every contact. */
function recordSources(sources, el) {
  if (!sources.size) return null;
  return el('div', { class: 'organization-sources' }, [
    el('p', { class: 'organization-contact__label' }, 'Reviewed sources'),
    ...[...sources.values()].map((source) => sourceDetails(source, el, false, true, true)),
  ]);
}

function contactRow(contact, el, ctx) {
  if (!contact || typeof contact !== 'object' || !['phone', 'website'].includes(contact.kind)) return null;
  const matches = Array.isArray(contact.matches)
    ? contact.matches.filter((match) => match && typeof match.organizationName === 'string' && reviewedSource(match.source)).slice(0, 12)
    : [];
  let status = Object.hasOwn(STATUS_LABELS, contact.status) ? contact.status : 'not-confirmed';
  if (typeof contact.value !== 'string' || !contact.value.trim()) status = 'not-provided';
  if (['matched', 'another-organization', 'outdated'].includes(status) && matches.length === 0) status = 'not-confirmed';
  const kind = contact.kind === 'phone' ? 'Phone number' : 'Website';
  // Label and value share one line; the source citation is collected once per record (ctx.sources).
  const row = el('li', { class: 'organization-contact', 'data-contact-status': status }, [
    el('p', { class: 'organization-contact__value' }, [
      el('span', { class: 'organization-contact__label' }, `${kind}: `),
      typeof contact.value === 'string' && contact.value ? text(contact.value) : 'not supplied',
    ]),
    el('p', { class: `organization-status organization-status--${status}` }, STATUS_LABELS[status]),
  ]);
  for (const match of matches) {
    const approved = reviewedSource(match.source);
    if (approved) ctx.sources.set(`${approved.url}|${approved.reviewedAt}`, match.source);
    row.append(el('p', { class: 'organization-contact__owner' }, [
      `Listed for ${text(match.organizationName)}`,
      match.scope ? ` · ${text(match.scope)}` : '',
    ]));
  }
  if (status === 'not-confirmed') ctx.unconfirmed = true;
  return row;
}

function officialContactsSection(contacts, el, ctx) {
  if (!Array.isArray(contacts)) return null;
  const reviewed = contacts.filter(contact => contact && ['phone', 'website'].includes(contact.kind)
    && typeof contact.value === 'string' && contact.value.trim()
    && ['matched', 'outdated'].includes(contact.status) && reviewedSource(contact.source)).slice(0, 64);
  const groups = ['website', 'phone'].map(kind => {
    const entries = reviewed.filter(contact => contact.kind === kind);
    // Sources are collected into the record's deduplicated list, not repeated per group.
    entries.forEach(contact => { ctx.sources.set(JSON.stringify(contact.source), contact.source); });
    return el('li', { class: 'organization-contact' }, [
      el('p', { class: 'organization-contact__label' }, kind === 'website' ? 'Official websites' : 'Official phone numbers'),
      entries.length ? el('ul', { class: 'organization-reference__entries' }, entries.map(contact => el('li', {
        class: 'organization-reference__entry', 'data-reference-status': contact.status,
      }, [
        el('p', { class: 'organization-contact__value' }, text(contact.value)),
        kind === 'phone' && contact.scope ? el('p', { class: 'organization-contact__owner' }, text(contact.scope)) : null,
        el('p', { class: `organization-status organization-status--${contact.status}` }, contact.status === 'outdated'
          ? 'Outdated record — recheck the source' : 'Listed in reviewed official source'),
      ]))) : el('p', { class: 'organization-contact__help' }, kind === 'phone'
        ? 'No phone number is available in the reviewed directory.' : 'No website is available in the reviewed directory.'),
    ]);
  });
  return el('div', { class: 'organization-reference' }, [
    el('h4', { class: 'organization-record__subheading' }, 'Official contact details'),
    el('p', { class: 'organization-contact__help' }, 'Reference details for contacting this organization independently, even when someone else wrote the message. Coverage is incomplete; check the source and regional scope.'),
    el('ul', { class: 'organization-contacts' }, groups),
  ]);
}

/** Existing/older responses without directory metadata omit this card. */
export function organizationChecksCard(data, el) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.organizations) || !Array.isArray(data.unmatchedContacts)) return null;
  const card = el('section', { class: 'card organization-checks', 'aria-labelledby': 'organization-checks-title' }, [
    el('h2', { class: 'card__title', id: 'organization-checks-title' }, 'Organization and contact checks'),
    el('p', { class: 'card__helper' }, 'This section uses reviewed directory records. Sender authenticity and link destinations are not established.'),
  ]);
  const organizations = data.organizations.filter((item) => item && typeof item.name === 'string' && item.name.trim()
    && ['name', 'domain', 'name-and-domain', 'phone'].includes(item.identifiedBy)).slice(0, 12);
  if (!organizations.length) {
    card.append(el('p', { class: 'card__body' }, 'No organization could be verified against the current directory.'),
      el('p', { class: 'card__body card__body--muted' }, 'The directory covers selected organizations. An organization missing from it is unverified, not proven fake.'));
  }
  for (const organization of organizations) {
    const identity = organization.identity;
    const source = ['matched', 'outdated'].includes(identity?.status) ? reviewedSource(identity?.source) : null;
    const ctx = { sources: new Map(), unconfirmed: false };
    if (source) ctx.sources.set(`${source.url}|${source.reviewedAt}`, identity.source);
    const section = el('section', { class: 'organization-record' }, [
      el('h3', { class: 'organization-record__name' }, text(organization.name)),
      el('p', { class: 'organization-record__basis' }, organization.identifiedBy === 'phone'
        ? 'Related organization identified from a listed phone number in the message; the sender is unconfirmed.'
        : organization.identifiedBy === 'domain'
        ? 'Organization identified from a website domain in the message; the sender is unconfirmed.'
        : organization.identifiedBy === 'name-and-domain'
          ? 'Organization named in the message and identified by a website domain; the sender is unconfirmed.'
          : 'Organization named in the message; the sender is unconfirmed.'),
      el('p', { class: `organization-status organization-status--${source && identity?.status === 'matched' ? 'matched' : source && identity?.status === 'outdated' ? 'outdated' : 'not-confirmed'}` }, source
        ? identity?.status === 'outdated' ? 'Organization record is outdated' : 'Organization record supported by an official source'
        : 'Organization record not confirmed'),
    ]);
    if (source && typeof identity?.description === 'string') section.append(el('p', { class: 'organization-record__description' }, text(identity.description)));
    const contacts = Array.isArray(organization.contacts) ? organization.contacts.slice(0, 64).map((contact) => contactRow(contact, el, ctx)).filter(Boolean) : [];
    if (contacts.length) section.append(
      el('h4', { class: 'organization-record__subheading' }, 'Contact details in the message'),
      el('ul', { class: 'organization-contacts' }, contacts));
    // One shared honesty line per record instead of one under every unconfirmed contact.
    if (ctx.unconfirmed) section.append(el('p', { class: 'organization-contact__help' }, 'The reviewed directory does not confirm these details. That does not establish that they are fake.'));
    const officialContacts = officialContactsSection(organization.officialContacts, el, ctx);
    if (officialContacts) section.append(officialContacts);
    const sources = recordSources(ctx.sources, el);
    if (sources) section.append(sources);
    card.append(section);
  }
  const unmatchedCtx = { sources: new Map(), unconfirmed: false };
  const unmatched = data.unmatchedContacts.slice(0, 64).map((contact) => contactRow(contact, el, unmatchedCtx)).filter(Boolean);
  if (unmatched.length) {
    const unmatchedSection = el('section', { class: 'organization-record' }, [
      el('h3', { class: 'organization-record__name' }, 'Contact details in the message'),
      el('ul', { class: 'organization-contacts' }, unmatched),
    ]);
    if (unmatchedCtx.unconfirmed) unmatchedSection.append(el('p', { class: 'organization-contact__help' }, 'The reviewed directory does not confirm these details. That does not establish that they are fake.'));
    const unmatchedSources = recordSources(unmatchedCtx.sources, el);
    if (unmatchedSources) unmatchedSection.append(unmatchedSources);
    card.append(unmatchedSection);
  }
  card.append(el('p', { class: 'organization-warning' }, WARNING));
  return card;
}
