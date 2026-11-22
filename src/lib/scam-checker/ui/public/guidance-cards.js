import { sanitizeText } from './render-safe.js';
import { sourceDetails } from './organization-card.js';
import { guidanceEvidence, linkEvidence, LINK_LABELS, PURPOSE_LABELS, TRUSTED_CHANNEL_FALLBACK, checkedAtLabel } from './evidence.js';
import { EXPOSURE_LABELS, relevantResources, selectedActions, toggleExposure } from './guidance.js';

export function linkInspectionCard(data, el) {
  const evidence = linkEvidence(data);
  const card = el('section', { class: 'card link-inspection', id: 'link-inspection', 'data-testid': 'link-inspection' }, [
    el('h2', { class: 'card__title' }, 'Link inspection'),
    el('p', { class: 'card__helper' }, 'Offline hostname comparison with reviewed records — not a live website or reputation check.'),
  ]);
  if (!evidence.available) card.append(el('p', { class: 'card__body' }, 'Link-inspection metadata is unavailable for this response. No hostname comparison can be shown.'));
  else {
    card.append(el('p', { class: 'card__helper' }, `Compared at ${checkedAtLabel(evidence.checkedAt) ?? evidence.checkedAt}`),
      el('p', { class: 'card__helper' }, `Lookalike scope: Latin, Greek, Cyrillic, Common and Inherited scripts${evidence.unicodeVersion ? `; Unicode ${evidence.unicodeVersion}` : '; version metadata unavailable'}. Other scripts and unsupported forms may not be inspectable.`));
    if (!evidence.findings.length) card.append(el('p', { class: 'card__body' }, 'No inspectable link findings supplied. That does not establish safety.'));
    evidence.findings.forEach(finding => {
      const record = el('div', { class: 'organization-record', 'data-link-status': finding.status }, [
        el('h3', { class: 'organization-record__name' }, LINK_LABELS[finding.status]),
        el('p', { class: 'organization-contact__label' }, 'Submitted hostname (inert text)'),
        el('p', { class: 'organization-contact__value' }, finding.hostname || 'Not available'),
        el('p', { class: 'organization-contact__label' }, 'Unicode display (inert text)'),
        el('p', { class: 'organization-contact__value' }, finding.unicodeHostname || 'Not available'),
        finding.scripts.length ? el('p', { class: 'card__helper' }, `Detected scripts: ${finding.scripts.join(', ')}`) : null,
      ]);
      finding.matches.forEach(match => record.append(
        el('p', { class: 'organization-contact__owner' }, `Related record: ${match.organizationName} · Official hostname: ${match.officialDomain || 'not supplied'}`),
        ...(match.outdated ? [el('p', { class: 'organization-status organization-status--outdated' }, 'Outdated source — recheck independently')] : []),
        ...[sourceDetails(match.source, el, false, !match.outdated)].filter(Boolean)));
      card.append(record);
    });
    if (evidence.limited) card.append(el('p', { class: 'card__footnote' }, 'Coverage is limited; some findings may be truncated or could not be validated.'));
  }
  // One trust note per disclosure: the shared fallback sentence stays in the Official support card,
  // so it is not repeated here.
  card.append(el('p', { class: 'organization-warning' }, 'Submitted links are never opened, fetched or resolved. Lookalike detection is heuristic and incomplete. A hostname match does not authenticate the sender or establish that a message, page or path is safe.'));
  return card;
}

export function officialResourcesCard(evidence, exposures, el) {
  const resources = relevantResources(evidence.resources, exposures);
  const card = el('section', { class: 'card official-resources', id: 'official-resources', 'data-testid': 'official-resources' }, [
    el('h2', { class: 'card__title' }, 'Official resources'),
    el('p', { class: 'card__helper' }, 'Resources relate to organizations identified in the message, not necessarily services you use. Check purpose, region, scope and review date. A general contact number is not necessarily a fraud or recovery hotline.'),
  ]);
  if (!evidence.available) card.append(el('p', { class: 'card__body' }, 'Official-resource metadata is unavailable for this response.'));
  else card.append(el('p', { class: 'card__helper' }, `Resource snapshot taken ${checkedAtLabel(evidence.checkedAt) ?? evidence.checkedAt}`));
  if (!resources.length) card.append(el('p', { class: 'card__body' }, 'No validated official resource is available for these selections.'));
  const sourceIndex = new Map();
  resources.forEach(resource => {
    const current = resource.status === 'current';
    const record = el('section', { class: 'organization-record', id: `official-resource-${resource.id}`, 'data-resource-id': resource.id, 'data-resource-status': resource.status }, [
      el('h3', { class: 'organization-record__name' }, resource.title),
      // One muted meta line per resource instead of separate Region/Scope/organization paragraphs.
      el('p', { class: 'card__helper' }, [
        PURPOSE_LABELS[resource.purpose],
        resource.organizationName ? ` — ${resource.organizationName}` : '',
        ` · Region: ${resource.region}`,
        ` · Scope: ${resource.scope || 'not supplied — verify with the official source'}`,
      ].join('')),
      el('p', { class: `organization-status${current ? '' : ' organization-status--outdated'}` }, current ? 'Current at check time — confirm before use' : 'Outdated reference — use an independently trusted official channel'),
    ]);
    if (resource.url) record.append(current
      ? el('a', { class: 'organization-source__link', href: resource.url, target: '_blank', rel: 'noopener noreferrer' }, 'Official website (opens in a new tab)')
      : el('p', { class: 'card__helper' }, `Official website (outdated reference): ${resource.url}`));
    if (resource.phone) record.append(el('p', { class: 'organization-contact__value' }, `Official phone${current ? '' : ' (outdated reference)'}: ${resource.phone}`));
    if (resource.source) {
      const key = JSON.stringify(resource.source);
      const existing = sourceIndex.get(key);
      // Outdated provenance never becomes a live link, even in the consolidated list.
      if (!existing || (!existing.linkable && current)) sourceIndex.set(key, { source: resource.source, linkable: current });
    }
    card.append(record);
  });
  // All reviewed sources once at the end of the card, not repeated under every resource.
  const sources = el('div', { class: 'organization-sources' }, [
    el('p', { class: 'organization-contact__label' }, 'Reviewed sources'),
    ...[...sourceIndex.values()].map((entry) => sourceDetails(entry.source, el, false, entry.linkable, true)),
  ]);
  if (sourceIndex.size) card.append(sources);
  if (evidence.limited) card.append(el('p', { class: 'card__footnote' }, 'Resource coverage is limited or some metadata could not be validated.'));
  card.append(el('p', { class: 'organization-warning' }, TRUSTED_CHANNEL_FALLBACK),
    el('p', { class: 'card__footnote' }, 'Nothing is reported automatically. A matched organization is not assumed to be your bank or payment provider.'));
  return card;
}

/** View-local ownership: answers are never added to history, requests or storage. */
export function guidanceCards(data, el, onChange) {
  const evidence = guidanceEvidence(data);
  let exposures = [];
  const card = el('section', { class: 'card guidance-card', id: 'next-steps' }, [el('h2', { class: 'card__title' }, 'What to do next')]);
  const fieldset = el('fieldset', { class: 'exposure-options', 'aria-describedby': 'exposure-help' }, [
    el('legend', { class: 'field-label' }, 'What happened? — optional'),
    el('p', { class: 'field-help', id: 'exposure-help' }, 'Optional — kept in this page only.'),
  ]);
  const inputs = new Map();
  const actionsArea = el('div', { class: 'guidance-actions', 'aria-live': 'polite' });
  const resourcesArea = el('div');
  const answerStatus = el('p', { class: 'card__helper', role: 'status', id: 'exposure-status' });
  function publish() { onChange([...exposures]); }
  function refresh() {
    inputs.forEach((input, value) => {
      input.checked = exposures.includes(value);
      input.closest('label')?.classList.toggle('is-selected', input.checked);
    });
    const resources = relevantResources(evidence.resources, exposures);
    const actions = selectedActions(exposures, resources, evidence.actions);
    answerStatus.textContent = exposures.length ? `Selected: ${exposures.map(value => EXPOSURE_LABELS[value]).join('; ')}` : 'Not answered — showing general guidance.';
    clear.hidden = !exposures.length;
    // Instructions only: no tick controls. The bottom answers decide which steps appear here.
    actionsArea.replaceChildren();
    if (!actions.length) {
      actionsArea.append(el('p', { class: 'card__helper' }, 'No current, validated action guidance is available. Use the trusted-channel fallback below.'),
        el('p', { class: 'organization-warning' }, TRUSTED_CHANNEL_FALLBACK));
    }
    actions.forEach(action => {
      const short = typeof action.short === 'string' && action.short.trim() ? action.short : action.text;
      const urgent = action.priority === 0;
      const row = el('div', { class: 'guidance-action', 'data-priority': action.priority, 'data-action-id': action.id }, [
        el('p', { class: 'guidance-action__text' }, short),
      ]);
      // The urgent money action keeps its complete sentence visible; everything else is in the
      // single "Full guidance" panel below, so nothing is lost and the first screen stays short.
      if (urgent) row.append(el('p', { class: 'guidance-action__fulltext' }, action.text));
      actionsArea.append(row);
    });
    if (actions.length) {
      const full = el('details', { class: 'guidance-details', id: 'full-guidance' }, [
        el('summary', {}, 'Full guidance for each step'),
        ...actions.map(action => {
          const entry = el('p', { class: 'guidance-details__entry' }, [
            el('strong', {}, typeof action.short === 'string' && action.short.trim() ? action.short : action.text), ' ',
            action.text,
          ]);
          // Resource links live here (and in the Official support disclosure) rather than on every row.
          if (action.resourceIds.length) entry.append(el('span', { class: 'guidance-details__links' }, action.resourceIds.map(id => {
            const resource = resources.find(item => item.id === id);
            return el('a', { class: 'organization-source__link', href: `#official-resource-${id}` }, `${sanitizeText(resource.title)}${resource.status === 'outdated' ? ' (outdated)' : ''}`);
          })));
          return entry;
        }),
      ]);
      actionsArea.append(full);
    }
    resourcesArea.replaceChildren(officialResourcesCard(evidence, exposures, el));
    publish();
  }
  // Compact toggle chips: still native labelled checkboxes (keyboard/Space/screen-reader unchanged),
  // wrapping into rows instead of four full-height stacked rows.
  const chips = el('div', { class: 'exposure-chips' });
  Object.entries(EXPOSURE_LABELS).forEach(([value, name]) => {
    const input = el('input', { type: 'checkbox', id: `exposure-${value}`, 'data-exposure': value });
    inputs.set(value, input);
    input.addEventListener('change', () => { exposures = toggleExposure(exposures, value, input.checked); refresh(); });
    chips.append(el('label', { class: 'check-option check-option--chip', for: `exposure-${value}` }, [input, el('span', {}, name)]));
  });
  // Full privacy copy stays one tap away instead of occupying the first screen.
  const usageDetails = el('details', { class: 'guidance-details', id: 'exposure-details' }, [
    el('summary', {}, 'How answers are used'),
    el('p', {}, 'Select all that apply, or only received it. Leave blank if you prefer. Answers stay in this page’s memory only, are not sent or saved, and reset for a new check.'),
  ]);
  fieldset.append(chips, usageDetails);
  const clear = el('button', { class: 'btn btn--ghost btn--small', type: 'button', id: 'exposure-clear' }, 'Clear answers');
  clear.addEventListener('click', () => { exposures = []; refresh(); });
  // Steps first so the answer is the first thing read; the optional "what happened" refinement follows.
  card.append(actionsArea, fieldset, answerStatus, clear);
  refresh();
  return { card, resources: resourcesArea };
}
