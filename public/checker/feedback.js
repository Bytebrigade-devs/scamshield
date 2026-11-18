/** "Report a wrong result" control (M4-07, owner decision 17/18 November 2026).
 *
 * Mirrors the agreed reason-code vocabulary in `code/boundary/feedback-reason-codes.ts`; a
 * drift test pins the two together. The control stores only the echoed server-generated check
 * id, the chosen reason code and a timestamp — never message text, never a rating. The ids on
 * the rendered nodes let `app.js` wire the interaction; this module stays DOM-light so the
 * rendering is testable with the existing node stub.
 */
export const FEEDBACK_REASON_CODES = ['wrong_category', 'missed_scam', 'false_alarm', 'unclear_explanation', 'other'];
export const FEEDBACK_REASON_LABELS = {
  wrong_category: 'Wrong category',
  missed_scam: 'Missed a scam',
  false_alarm: 'False alarm',
  unclear_explanation: 'Unclear explanation',
  other: 'Other',
};
export const FEEDBACK_TITLE = 'Report a wrong result';
export const FEEDBACK_HELPER =
  'Optional. Records the check id, your chosen reason and a timestamp only — never your message text. Demo build: storage is in-memory and resets on restart.';

/** Confirmation shown after an accepted report. */
export function feedbackSubmittedText(code) {
  const label = FEEDBACK_REASON_LABELS[code] ?? code;
  return `Reported as "${label}". Thank you — this helps improve the checker. Nothing about your message was stored.`;
}

/** Honest failure line: the report was not saved. */
export function feedbackFailedText() {
  return 'The report could not be saved. Nothing was sent or stored.';
}

/** Extract the feedback option from a check payload; null hides the control. */
export function feedbackModel(feedback) {
  if (!feedback || typeof feedback !== 'object') return null;
  const { checkId, reasonCodes } = feedback;
  if (typeof checkId !== 'string' || checkId.length === 0 || /\s/.test(checkId)) return null;
  if (!Array.isArray(reasonCodes) || reasonCodes.length === 0) return null;
  const codes = reasonCodes.filter(code => typeof code === 'string' && Object.prototype.hasOwnProperty.call(FEEDBACK_REASON_LABELS, code));
  if (codes.length === 0) return null;
  return { checkId, reasonCodes: codes };
}

/** Render the control; returns null when the payload carries no reportable check. */
export function feedbackControl(feedback, el) {
  const model = feedbackModel(feedback);
  if (!model) return null;
  const options = el('fieldset', { class: 'feedback__options' }, model.reasonCodes.map(code => el('label', { class: 'feedback__option' }, [
    el('input', { type: 'radio', name: 'feedback-reason', id: `feedback-reason-${code}`, value: code }),
    ' ' + FEEDBACK_REASON_LABELS[code],
  ])));
  return el('section', { class: 'card feedback', 'data-testid': 'feedback', 'aria-labelledby': 'feedback-title' }, [
    el('h2', { class: 'card__title', id: 'feedback-title' }, FEEDBACK_TITLE),
    el('p', { class: 'card__helper' }, FEEDBACK_HELPER),
    options,
    el('div', { class: 'card__actions' }, [
      el('button', { class: 'btn', type: 'button', id: 'feedback-submit' }, 'Report'),
    ]),
    el('p', { class: 'card__footnote', id: 'feedback-status', role: 'status' }, ''),
  ]);
}
