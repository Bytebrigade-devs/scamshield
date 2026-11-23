/** Evidence is separate from the message risk assessment and never authenticates a sender. */
import { sanitizeText } from './render-safe.js';
import { reviewedSource, sourceDetails } from './organization-card.js';

const WARNING = 'Matching official contact details does not authenticate the sender or prove the message is safe.';
const safeText = value => typeof value === 'string' ? sanitizeText(value) : '';

export function aiFailureMessage(failure) {
  const messages = {
    'output-limit': 'The AI response was cut short before it could produce a complete assessment.',
    timeout: 'The AI provider did not complete its response within the time limit.',
    'rate-limited': 'The AI provider is temporarily limiting requests. Please wait before checking again.',
    'invalid-response': 'The AI provider returned a response that could not be validated as an assessment.',
    network: 'The AI provider could not be reached because of a connection problem.',
    'provider-error': 'The AI provider returned a service error. No usable AI assessment is available.',
  };
  if (!failure || !Object.hasOwn(messages, failure.code)) return null;
  return `${messages[failure.code]} No automatic retry was made.`;
}

export function senderVerificationCard(data, el) {
  if (!data || typeof data.value !== 'string' || !data.value.trim() || !['name', 'phone', 'email'].includes(data.kind)) return null;
  const matches = Array.isArray(data.matches) ? data.matches.filter(match => match && typeof match.organizationName === 'string'
    && reviewedSource(match.source)).slice(0, 12) : [];
  const status = data.kind !== 'name' && matches.length && ['matched', 'outdated'].includes(data.status)
    ? data.status : 'not-confirmed';
  const card = el('section', { class: 'card sender-verification', 'aria-labelledby': 'sender-verification-title', 'data-sender-status': status }, [
    el('h2', { class: 'card__title', id: 'sender-verification-title' }, 'Sender comparison'),
    el('p', { class: 'card__helper' }, 'Sender information was supplied by the user. Displayed names, phone numbers and email addresses can be spoofed.'),
    el('p', { class: 'organization-contact__label' }, data.kind === 'name' ? 'Displayed sender name' : data.kind === 'phone' ? 'Supplied sender phone' : 'Supplied sender email'),
    el('p', { class: 'organization-contact__value' }, safeText(data.value)),
    el('p', { class: `organization-status organization-status--${status}` }, status === 'matched'
      ? 'Matches a reviewed contact record; sender remains unverified'
      : status === 'outdated' ? 'Contact record is outdated; sender remains unverified'
        : data.kind === 'name' ? 'A displayed sender name alone cannot authenticate an organization' : 'Sender contact not confirmed against reviewed records'),
  ]);
  for (const match of matches) {
    card.append(el('p', { class: 'organization-contact__owner' }, `Listed for ${safeText(match.organizationName)}${match.scope ? ` · ${safeText(match.scope)}` : ''}`), sourceDetails(match.source, el));
  }
  card.append(el('p', { class: 'organization-warning' }, WARNING));
  return card;
}
