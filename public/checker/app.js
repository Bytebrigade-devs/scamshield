/** ScamShield message checker. Untrusted content is rendered only as safe text nodes. */
import { sanitizeText } from '/checker/render-safe.js';
import { organizationChecksCard } from '/checker/organization-card.js';
import { senderVerificationCard, aiFailureMessage } from '/checker/provenance-cards.js';
import { CATEGORY_LABELS, MODE_LABELS, RISK_BANDS, categoryLabel, riskAssessment, ruleExplanation, validMatches, localPatterns, deepFreeze } from '/checker/assessment.js';
import { guidanceCards, linkInspectionCard } from '/checker/guidance-cards.js';
import { createSummaryModel } from '/checker/summary.js';
import { summaryCard } from '/checker/summary-card.js';
import { formatCheckTime } from '/checker/evidence.js';
import { linkWarningBanner } from '/checker/link-banner.js';
import { feedbackControl, feedbackFailedText, feedbackSubmittedText } from '/checker/feedback.js';

const view = document.getElementById('view');
const navCheck = document.getElementById('nav-check');
const navHistory = document.getElementById('nav-history');
const HISTORY_KEY = 'scamshield-check-history-v2';
const HISTORY_LIMIT = 20;
const FALLBACK_CAP = 2000;
const state = { config: null, configLoading: true, text: '', sender: '', busy: false, view: 'input', history: readHistory(), check: null };

/** Narration controls for long AI reasons; re-synced on resize and discarded when their view is replaced. */
const explanationClamps = new Set();
const NARROW_QUERY = '(max-width: 720px)';
const CLAMP_OVERFLOW_MIN = 48;
let explanationResizeTimer = null;

window.addEventListener('resize', () => {
  clearTimeout(explanationResizeTimer);
  explanationResizeTimer = setTimeout(() => {
    for (const entry of explanationClamps) {
      if (entry.paragraph.isConnected) entry.sync();
      else explanationClamps.delete(entry);
    }
  }, 150);
});


function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function heading(label, title, subtitle) {
  return [el('p', { class: 'eyebrow' }, label), el('h1', { class: 'page-title' }, title),
    subtitle ? el('p', { class: 'page-subtitle' }, subtitle) : null].filter(Boolean);
}

/** Native disclosure so secondary result material is opt-in and keyboard-operable. */
function disclosure(title, meta, children) {
  return el('details', { class: 'disclosure' }, [
    el('summary', { class: 'disclosure__summary' }, [
      el('span', { class: 'disclosure__title' }, title),
      meta ? el('span', { class: 'disclosure__meta' }, meta) : null,
      el('span', { class: 'disclosure__chevron', 'aria-hidden': 'true' }),
    ]),
    el('div', { class: 'disclosure__body' }, children),
  ]);
}

function updateNavigation() {
  for (const [button, current] of [[navCheck, state.view !== 'history'], [navHistory, state.view === 'history']]) {
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    button.disabled = state.busy;
  }
}

function focusHeading() {
  const title = view.querySelector('h1');
  title?.setAttribute('tabindex', '-1');
  title?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function validHistoryEntry(entry) {
  return entry !== null && typeof entry === 'object' &&
    Number.isFinite(entry.at) && !Number.isNaN(new Date(entry.at).getTime()) &&
    typeof entry.excerpt === 'string' && entry.excerpt.length <= 121 &&
    typeof entry.assessment === 'string' && entry.assessment.length <= 500 &&
    Object.hasOwn(CATEGORY_LABELS, entry.category) && Object.hasOwn(MODE_LABELS, entry.mode);
}

function readHistory() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(validHistoryEntry).slice(0, HISTORY_LIMIT) : [];
  } catch { return []; }
}

function writeHistory(entries) {
  state.history = entries.slice(0, HISTORY_LIMIT);
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); }
  catch { /* Storage can be denied; the current page keeps its in-memory list. */ }
}

function formatTimestamp(epochMs) {
  return formatCheckTime(epochMs) ?? '';
}

function inputCap() {
  return Number.isInteger(state.config?.limits?.inputCharCap) && state.config.limits.inputCharCap > 0
    ? state.config.limits.inputCharCap : FALLBACK_CAP;
}

function noticeBlock() {
  const transfer = state.config === null
    ? state.configLoading ? 'Checking how your message will be processed…' : 'Processing information is unavailable. Connect to the service before submitting.'
    : state.config.liveConfigured
      ? 'When you check, your message, optional sender information and local findings go to ScamShield’s server and the configured AI provider for analysis.'
      : 'When you check, your text goes to ScamShield’s server for local pattern checks. AI analysis is not available.';
  return el('section', { class: 'notice', 'aria-labelledby': 'notice-title' }, [
    el('h3', { class: 'notice__title', id: 'notice-title' }, 'Before you check'),
    el('p', { id: 'transfer-notice' }, transfer),
    el('p', { id: 'safety-notice' }, 'Remove personal details. Do not paste passwords, one-time codes (OTPs), full card or bank account numbers, private keys or private vault notes. These are not automatically removed.'),
    el('p', {}, 'Results are guidance, not a guarantee of safety. A short excerpt and result are kept in this tab’s history.'),
    el('details', { class: 'privacy-details' }, [
      el('summary', {}, 'How your message is used'),
      el('p', {}, 'Message and sender information are sent only when you select Check message, not while you type. Organization names, phone numbers and website hostnames are compared offline with a reviewed directory; selected Unicode hostname patterns may be flagged as possible lookalikes. This is incomplete, heuristic evidence, not ownership or safety verification. Submitted links are not opened, fetched, resolved or checked for reputation; the AI provider cannot open them either.'),
      el('p', {}, 'Sender information is user-provided evidence and can be spoofed. It is not added to tab-session history.'),
      el('p', {}, 'History holds up to 20 checks in this browser tab’s session and is not synced with an account. Clear history removes this list; it does not delete any provider records. If browser storage is unavailable, the list lasts only until this page is reloaded.'),
      el('p', {}, state.config?.liveConfigured
        ? 'The AI provider’s retention depends on its service and account settings. A failed check does not prove that the provider received or kept nothing.'
        : state.config === null ? 'Processing information must be available before you can submit a message.'
          : 'This check uses local rules only and does not send your text to an AI provider.'),
    ]),
  ]);
}

function renderInput(options = {}) {
  document.getElementById('print-summary').textContent = '';
  const { loading = false, fieldError = null, senderError = null, formError = null, focus = null } = options;
  state.view = 'input';
  updateNavigation();
  view.replaceChildren(...heading('Scam checker', 'Check a suspicious message', 'Review suspicious email, SMS or agreement text before deciding what to do next.'));
  const form = el('form', { class: 'card', novalidate: true, 'aria-busy': loading ? 'true' : 'false' });
  form.append(el('h2', { class: 'card__title' }, 'Message to check'));
  form.append(el('p', { class: 'card__helper', id: 'message-help' }, 'Paste the message as text. Do not include passwords, OTPs, full card or bank account numbers, or private keys. Sensitive details are not automatically removed.'));
  const formAlert = formError ?? (!state.configLoading && state.config === null
    ? 'We couldn’t load the checking service. Try connecting again before submitting your message.' : null);
  if (formAlert) {
    const alert = el('div', { class: 'form-alert', role: 'alert', id: 'form-error', tabindex: '-1' }, sanitizeText(formAlert));
    if (state.config === null) {
      const retry = el('button', { type: 'button', class: 'btn btn--ghost' }, 'Try connecting again');
      retry.addEventListener('click', () => loadConfig());
      alert.append(retry);
    }
    form.append(alert);
  }
  const field = el('div', { class: 'field' });
  field.append(el('label', { class: 'visually-hidden', for: 'message' }, 'Message to check'));
  const textarea = el('textarea', {
    id: 'message', class: 'message-input', placeholder: 'Paste the suspicious message here.',
    'aria-describedby': `message-help character-count safety-notice transfer-notice${fieldError ? ' message-error' : ''}`,
    'aria-invalid': fieldError ? 'true' : 'false', disabled: loading,
  });
  textarea.value = state.text;
  const counter = el('span', { class: 'character-count', id: 'character-count' });
  const countHint = el('span', { id: 'count-hint', class: 'field-error', 'aria-live': 'polite' });
  field.append(textarea, el('div', { class: 'field-meta' }, [countHint, counter]));
  let fieldAlert = fieldError ? el('p', { class: 'field-error', id: 'message-error', role: 'alert' }, sanitizeText(fieldError)) : null;
  let fieldErrorActive = Boolean(fieldError);
  if (fieldAlert) field.append(fieldAlert);
  const senderField = el('div', { class: 'field' }, [
    el('label', { class: 'field-label', for: 'sender' }, 'Sender information — optional'),
    el('p', { class: 'field-help', id: 'sender-help' }, 'Enter the displayed SMS sender name, phone number or email address. This does not authenticate the sender.'),
  ]);
  const senderInput = el('input', { id: 'sender', class: 'sender-input', type: 'text', maxlength: '254', autocomplete: 'off',
    placeholder: 'For example: displayed SMS name or email address', disabled: loading,
    'aria-describedby': `sender-help${senderError ? ' sender-error' : ''}`, 'aria-invalid': senderError ? 'true' : 'false' });
  senderInput.value = state.sender;
  senderField.append(senderInput);
  let senderAlert = senderError ? el('p', { class: 'field-error', id: 'sender-error', role: 'alert' }, sanitizeText(senderError)) : null;
  if (senderAlert) senderField.append(senderAlert);
  const button = el('button', { type: 'submit', class: 'btn' }, loading ? 'Checking…' : 'Check message');
  const progress = el('p', { class: 'actions-note', role: 'status' }, loading
    ? 'Checking your message…' : state.configLoading ? 'Connecting to the checking service…' : '');
  function refreshFieldState() {
    const cap = inputCap();
    const over = state.text.length > cap;
    counter.textContent = `${state.text.length.toLocaleString('en-US')} / ${cap.toLocaleString('en-US')} characters`;
    countHint.textContent = over && !fieldErrorActive ? 'Shorten the message to continue.' : '';
    textarea.setAttribute('aria-invalid', fieldAlert || over ? 'true' : 'false');
    textarea.setAttribute('aria-describedby', `message-help character-count safety-notice transfer-notice${fieldAlert ? ' message-error' : ''}${over ? ' count-hint' : ''}`);
    const senderOver = state.sender.length > 254;
    senderInput.setAttribute('aria-invalid', senderAlert || senderOver ? 'true' : 'false');
    button.disabled = loading || state.config === null || over || senderOver || state.text.trim().length === 0;
  }
  textarea.addEventListener('input', () => {
    state.text = textarea.value;
    if (fieldAlert) { fieldAlert.remove(); fieldAlert = null; fieldErrorActive = false; }
    refreshFieldState();
  });
  senderInput.addEventListener('input', () => {
    state.sender = senderInput.value;
    if (senderAlert) { senderAlert.remove(); senderAlert = null; senderInput.setAttribute('aria-describedby', 'sender-help'); }
    refreshFieldState();
  });
  form.append(field, senderField, noticeBlock(), el('div', { class: 'card__actions card__actions--input' }, [progress, button]));
  form.addEventListener('submit', (event) => { event.preventDefault(); submitCheck(); });
  view.append(form);
  refreshFieldState();
  if (focus === 'textarea') textarea.focus();
  else if (focus === 'sender') senderInput.focus();
  else if (focus === 'alert') document.getElementById('form-error')?.focus();
  else if (focus === 'heading') focusHeading();
}

function messageParagraph(text, matches, explanation = false) {
  const safe = sanitizeText(text);
  const paragraph = el('p', { class: explanation ? 'assessment__explanation' : 'message-text' });
  const spans = [];
  for (const match of validMatches(text, matches)) {
    const previous = spans.at(-1);
    if (previous && match.start < previous.end) previous.end = Math.max(previous.end, match.end);
    else spans.push({ start: match.start, end: match.end });
  }
  let cursor = 0;
  for (const span of spans) {
    const excerpt = safe.slice(span.start, span.end);
    paragraph.append(document.createTextNode(safe.slice(cursor, span.start)),
      el('mark', { class: explanation ? 'assessment__highlight' : 'evidence' }, explanation ? el('strong', {}, excerpt) : excerpt));
    cursor = span.end;
  }
  paragraph.append(document.createTextNode(safe.slice(cursor)));
  return paragraph;
}

/**
 * A long AI reason can push the next steps past the first screen on a phone. Clamp it only on narrow
 * viewports, only when the saving is worth the control, and never truncate without an explicit,
 * keyboard-operable way to read the whole text. Text stays in the DOM and is only visually clipped.
 */
function explanationToggle(paragraph) {
  const button = el('button', { type: 'button', class: 'assessment__more', 'aria-expanded': 'false', 'aria-controls': paragraph.id }, 'Read full explanation');
  const row = el('div', { class: 'assessment__more-row' }, [button]);
  const narrow = window.matchMedia(NARROW_QUERY);
  let expanded = false;
  function sync() {
    paragraph.classList.remove('is-clamped');
    let clipped = false;
    if (narrow.matches) {
      paragraph.classList.add('is-clamped');
      clipped = paragraph.scrollHeight - paragraph.clientHeight > CLAMP_OVERFLOW_MIN;
      if (!clipped || expanded) paragraph.classList.remove('is-clamped');
    } else {
      expanded = false;
    }
    row.hidden = !clipped;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Show less' : 'Read full explanation';
  }
  button.addEventListener('click', () => { expanded = !expanded; sync(); });
  explanationClamps.add({ paragraph, sync });
  return { row, sync };
}


function messageCard(outcome, highlights = true) {
  const text = state.check.text;
  const card = el('section', { class: 'card' }, [el('h2', { class: 'card__title' }, 'Your message')]);
  card.append(highlights ? messageParagraph(text, outcome.rules?.matches) : el('p', { class: 'message-text' }, sanitizeText(text)));
  card.append(el('p', { class: 'card__footnote' }, highlights && validMatches(text, outcome.rules?.matches).length
    ? 'Highlighted wording relates to the patterns below. Message links have not been opened or verified.'
    : 'Message links have not been opened or verified.'));
  return card;
}

function evidenceCard(matches) {
  // The distinct local-pattern count lives here, beside the evidence it counts — not in the AI risk meter.
  const count = localPatterns(state.check.text, matches).count;
  const card = el('section', { class: 'card' }, [el('h2', { class: 'card__title' }, count ? `Patterns in your message · ${count}` : 'Patterns in your message')]);
  const groups = [];
  for (const match of validMatches(state.check.text, matches)) {
    const reason = ruleExplanation(match.ruleId);
    const previous = groups.at(-1);
    if (previous && match.start < previous.end) { previous.end = Math.max(previous.end, match.end); previous.reasons.add(reason); }
    else groups.push({ start: match.start, end: match.end, reasons: new Set([reason]) });
  }
  if (groups.length === 0) {
    card.append(el('p', { class: 'card__body' }, 'No local patterns were found. Scams can still be missed, so this does not establish that the message is safe.'));
    return card;
  }
  card.append(el('p', { class: 'card__helper' }, 'These clues need review; they do not prove that a message is a scam.'));
  const list = el('div', { class: 'evidence-list' });
  for (const group of groups) {
    list.append(el('div', { class: 'evidence-item' }, [
      el('p', { class: 'evidence-item__quote' }, sanitizeText(state.check.text.slice(group.start, group.end))),
      el('ul', { class: 'evidence-item__reasons' },
        [...group.reasons].map((reason) => el('li', { class: 'evidence-item__reason' }, reason))),
    ]));
  }
  card.append(list);
  return card;
}

function footerActions(label, onClick) {
  const button = el('button', { type: 'button', class: 'btn' }, label);
  button.addEventListener('click', onClick);
  return el('div', { class: 'card__actions card__actions--footer' }, [button]);
}

/** How the AI step of this check ended. The local pattern scan always completes for a result. */
function aiScanState(payload) {
  const { outcome } = payload;
  if (outcome.analysisStatus === 'completed') return { text: 'Completed', state: 'ok' };
  if (outcome.analysisStatus === 'unavailable') return { text: 'Failed', state: 'fail' };
  return payload.providerMode === 'live-unconfigured'
    ? { text: 'Not configured', state: 'off' } : { text: 'Failed', state: 'fail' };
}

/** Plain statement of which scans ran, so a result never looks like nothing was checked. */
function resultMetaLine(payload) {
  const { outcome } = payload;
  const items = ['Local pattern scan: Completed', `AI analysis: ${aiScanState(payload).text}`];
  if (outcome.analysisStatus !== 'unavailable') {
    // On a completed check "AI analysis: Completed" already names the mode; the explicit Mode
    // label only earns its place in the limited (rules-only) state.
    if (outcome.analysisStatus !== 'completed') items.push(`Mode: ${MODE_LABELS[outcome.analysisMode]}`);
    items.push(`Category: ${categoryLabel(outcome.category)}`);
  }
  const line = el('p', { class: 'result-meta' });
  // Whitespace between flex items is not rendered but keeps the text readable to assistive technology.
  for (const item of items) { line.append(' '); line.append(el('span', {}, item)); }
  return line;
}

/** Qualitative AI risk bands. The local-pattern count is shown beside the evidence itself, not here. */
function riskMeter(payload) {
  const risk = riskAssessment(payload.outcome);
  const bands = el('ol', { class: 'risk-meter__bands' }, ['low', 'suspicious', 'high'].map((level) =>
    el('li', { class: `risk-meter__band${risk.level === level ? ' risk-meter__band--current' : ''}` }, [
      el('span', { class: 'risk-meter__name' }, RISK_BANDS[level].label),
      risk.level === level ? el('span', { class: 'risk-meter__current' }, 'Selected') : null,
    ])));
  return el('div', { class: 'risk-meter', 'data-risk': risk.level, role: 'group', 'aria-label': `AI risk assessment: ${risk.label}` }, [
    el('p', { class: 'risk-meter__title' }, 'AI risk assessment'),
    bands,
    risk.level === 'undetermined' ? el('p', { class: 'risk-meter__unknown' }, 'Undetermined — no risk band selected.') : null,
  ]);
}

/**
 * Verdict icon (Lucide outline shapes, ISC — notice retained in design/M4-result-layouts.md).
 * Built as static SVG DOM nodes; no untrusted content ever enters it. Decorative: the heading
 * text already carries the risk wording, so the icon is hidden from assistive technology.
 */
const ICON_PATHS = {
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  info: ['M12 16v-4', 'M12 8h.01'],
};
function verdictIcon(status, level) {
  const shape = status !== 'completed' || level === 'high' || level === 'suspicious' ? 'alert' : level === 'low' ? 'shield' : 'info';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ class: 'assessment__icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  if (shape === 'info') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [key, value] of Object.entries({ cx: '12', cy: '12', r: '10' })) circle.setAttribute(key, value);
    svg.append(circle);
  }
  for (const d of ICON_PATHS[shape]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function renderResult(payload) {
  const { outcome } = payload;
  const status = outcome.analysisStatus;
  const risk = riskAssessment(outcome);
  state.view = 'result';
  updateNavigation();
  explanationClamps.clear();
  // No subtitle on the result: the verdict and the actions card already say what this is and what to do.
  view.replaceChildren(...heading(status === 'completed' ? 'Check complete'
    : status === 'limited' ? 'Local patterns only' : 'AI step unavailable',
  status === 'completed' ? 'Your message assessment'
    : status === 'limited' ? 'Limited message assessment' : 'Local scan completed'));
  const assessment = el('section', { class: `assessment${status === 'limited' ? ' assessment--limited' : status === 'unavailable' ? ' assessment--failed' : ''}`, 'data-risk': risk.level });
  assessment.append(el('div', { class: 'assessment__head' }, [
    verdictIcon(status, risk.level),
    el('h2', { class: 'assessment__title' }, status === 'completed'
      ? risk.heading : status === 'limited' ? 'Rules-only analysis' : 'AI analysis failed'),
  ]));
  const reason = status === 'completed'
    ? outcome.reply?.reason || 'Review the message and any local patterns below.'
    : status === 'limited' ? 'Local patterns can miss scams and can also flag legitimate messages.'
      : 'Your message was still scanned with local scam patterns — they are listed below. This is not a safety verdict.';
  const explanation = messageParagraph(reason, status === 'completed' ? outcome.reply?.reasonHighlights : [], true);
  explanation.id = 'assessment-explanation';
  assessment.append(explanation);
  const explanationMore = explanationToggle(explanation);
  assessment.append(explanationMore.row);
  const failure = status === 'unavailable' ? aiFailureMessage(payload.aiFailure) : null;
  if (failure) assessment.append(el('p', { class: 'assessment__diagnostic', role: 'status' }, failure));
  assessment.append(riskMeter(payload), resultMetaLine(payload));
  assessment.append(el('p', { class: 'assessment__footnote' }, status === 'unavailable'
    ? 'A service failure does not prove that your text was not transferred to or retained by the AI provider.'
    : 'This is a qualitative assessment, not a scam probability, and guidance rather than a guarantee of safety. The sender has not been authenticated and links have not been checked for reputation.'));
  // Warning banner above the verdict when link-shape flags exist (owner decision, 17 November 2026).
  const linkBanner = linkWarningBanner(payload.linkInspection, el);
  if (linkBanner) view.append(linkBanner);
  view.append(assessment);
  // Layout is only measurable once the paragraph is in the document.
  explanationMore.sync();
  if (document.fonts?.ready) document.fonts.ready.then(() => explanationMore.sync()).catch(() => {});
  // The actions card follows the verdict directly: it is what a worried user needs first.
  const summary = summaryCard(state.check.summary, el);
  const guidance = guidanceCards(payload.guidanceResources, el, (answers, completed) => summary.update(answers, completed));
  view.append(guidance.card);
  // Local rule evidence is shown in every analysed state, including unavailable: stages 1–2
  // always ran, so hiding real evidence would leave the user with less than the server knows.
  view.append(evidenceCard(outcome.rules?.matches));
  // "Report a wrong result" (owner decision, 17/18 November 2026; demoted into the reference
  // disclosures on 20 November 2026): the server supplies the check id and the allowed reason
  // codes; this only echoes them back. No message text.
  const feedback = feedbackControl(payload.feedback, el);
  if (feedback) {
    const submit = feedback.querySelector('#feedback-submit');
    const statusLine = feedback.querySelector('#feedback-status');
    submit.addEventListener('click', () => {
      const checked = feedback.querySelector('input[name="feedback-reason"]:checked');
      if (!checked) {
        statusLine.textContent = 'Choose a reason first.';
        return;
      }
      submit.disabled = true;
      statusLine.textContent = 'Sending…';
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkId: payload.feedback.checkId, reasonCode: checked.value }),
      })
        .then(response => {
          if (!response.ok) throw new Error('report-failed');
          statusLine.textContent = feedbackSubmittedText(checked.value);
          feedback.querySelector('.feedback__options').remove();
          submit.remove();
        })
        .catch(() => {
          statusLine.textContent = feedbackFailedText();
          submit.disabled = false;
        });
    });
  }
  // Everything below is reference material until the user asks for it.
  const organizationCard = organizationChecksCard(payload.organizationVerification, el);
  const senderCard = senderVerificationCard(payload.senderVerification, el);
  const resourceCount = payload.guidanceResources?.resources?.length ?? 0;
  view.append(el('div', { class: 'result-secondary' }, [
    disclosure('The message you checked', null, [messageCard(outcome)]),
    disclosure('Sender, organization and link checks', null,
      [organizationCard, senderCard, linkInspectionCard(payload.linkInspection, el)]),
    disclosure('Official support and reporting', resourceCount ? `${resourceCount} reviewed` : null, [guidance.resources]),
    disclosure('Export this check', null, [summary.card]),
    // Optional, low-frequency correction control: reference-level weight, not a primary card.
    feedback ? disclosure('Something wrong with this result?', null, [feedback]) : null,
  ].filter(Boolean)));
  view.append(footerActions(status === 'unavailable' ? 'Return to message' : 'Check another message',
    status === 'unavailable' ? () => renderInput({ focus: 'textarea' }) : () => { state.text = ''; state.sender = ''; renderInput({ focus: 'textarea' }); }));
  focusHeading();
}

function renderHistory() {
  document.getElementById('print-summary').textContent = '';
  state.view = 'history';
  updateNavigation();
  view.replaceChildren(...heading('Recent checks', 'Your check history', 'Up to 20 checks from this tab’s session. This history is not synced with an account.'));
  const card = el('section', { class: 'card' }, [el('h2', { class: 'card__title' }, state.history.length ? 'Checks in this tab' : 'No checks yet')]);
  if (state.history.length === 0) card.append(el('p', { class: 'card__body card__body--muted' }, 'Check a message to see its result and a short excerpt here.'));
  else {
    const list = el('div', { class: 'history-list' });
    for (const entry of state.history) {
      list.append(el('article', { class: 'history-item' }, [
        el('p', { class: 'history-item__meta' }, [el('time', { datetime: new Date(entry.at).toISOString() }, formatTimestamp(entry.at))]),
        el('p', { class: 'history-item__excerpt' }, sanitizeText(entry.excerpt)),
        el('p', { class: 'history-item__detail' }, sanitizeText(entry.assessment)),
        el('p', { class: 'history-item__detail' }, `${MODE_LABELS[entry.mode]} · Category: ${categoryLabel(entry.category)}`),
      ]));
    }
    card.append(list);
    const clear = el('button', { class: 'btn btn--ghost', type: 'button', id: 'clear-history' }, 'Clear history');
    clear.addEventListener('click', () => { writeHistory([]); renderHistory(); });
    card.append(el('div', { class: 'card__actions' }, [el('p', { class: 'actions-note' }, 'Clears this list only. It does not delete provider records.'), clear]));
  }
  view.append(card, footerActions('Check a message', () => renderInput({ focus: 'textarea' })));
  focusHeading();
}

function addHistoryEntry(payload) {
  const outcome = payload.outcome;
  const text = state.text.replace(/\s+/g, ' ').trim();
  writeHistory([{
    at: Date.now(), excerpt: text.length > 120 ? `${text.slice(0, 120)}…` : text,
    category: Object.hasOwn(CATEGORY_LABELS, outcome.category) ? outcome.category : 'unknown_other',
    assessment: outcome.analysisStatus === 'completed' ? riskAssessment(outcome).heading
      : outcome.analysisStatus === 'limited' ? 'Limited message assessment' : 'AI analysis failed',
    mode: outcome.analysisMode,
  }, ...state.history]);
}

async function submitCheck() {
  if (state.busy || state.config === null) return;
  if (state.sender.length > 254) {
    renderInput({ focus: 'sender', senderError: 'Shorten sender information to 254 characters or fewer.' });
    return;
  }
  const text = state.text;
  if (text.trim().length === 0 || text.length > inputCap()) {
    renderInput({ focus: 'textarea', fieldError: text.trim().length === 0
      ? 'Paste a message before checking.' : `Shorten your message to ${inputCap().toLocaleString('en-US')} characters or fewer.` });
    return;
  }
  state.busy = true;
  renderInput({ loading: true });
  try {
    const sender = state.sender.trim();
    const response = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, ...(sender ? { sender } : {}) }) });
    if (!response.ok) throw new Error('request-failed');
    const payload = await response.json();
    state.busy = false;
    if (payload.outcome?.kind === 'rejected') {
      const invalid = payload.outcome.reason === 'invalid-input';
      renderInput({ focus: invalid ? 'textarea' : 'alert', [invalid ? 'fieldError' : 'formError']: payload.outcome.message });
      return;
    }
    const outcome = payload.outcome;
    if (outcome?.kind !== 'analysed' || !['completed', 'limited', 'unavailable'].includes(outcome.analysisStatus)
      || !Object.hasOwn(MODE_LABELS, outcome.analysisMode)) throw new Error('invalid-result');
    const at = [payload.organizationVerification?.checkedAt, payload.linkInspection?.checkedAt, payload.guidanceResources?.checkedAt]
      .find(value => typeof value === 'string' && Number.isFinite(Date.parse(value))) ?? new Date().toISOString();
    // Keep this submitted check separate from the mutable editor. Summary is an allowlist projection.
    state.check = deepFreeze({ text, payload: structuredClone(payload), summary: createSummaryModel(payload, text, at) });
    addHistoryEntry(state.check.payload);
    renderResult(state.check.payload);
  } catch {
    state.busy = false;
    renderInput({ focus: 'alert', formError: 'We couldn’t reach the checking service or read its response. Your message is still here. Please try again.' });
  }
}

async function loadConfig() {
  state.configLoading = true;
  if (state.view === 'input') renderInput();
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('config-unavailable');
    const config = await response.json();
    if (typeof config.liveConfigured !== 'boolean' || !Number.isInteger(config.limits?.inputCharCap) || config.limits.inputCharCap <= 0) throw new Error('invalid-config');
    state.config = config;
  } catch { state.config = null; }
  state.configLoading = false;
  if (state.view === 'input') renderInput();
}

navCheck.addEventListener('click', () => { if (!state.busy) renderInput({ focus: 'heading' }); });
navHistory.addEventListener('click', () => { if (!state.busy) renderHistory(); });
renderInput();
loadConfig();
