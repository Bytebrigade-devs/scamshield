/**
 * M4 — reason-code vocabulary for the "Report a wrong result" control (M4-07 / OD-M4-07).
 *
 * Owner-approved 18 November 2026: a bounded enum — wrong_category, missed_scam, false_alarm,
 * unclear_explanation, other. Free text is never accepted. These codes satisfy the store's
 * `/^[a-z][a-z0-9_]{0,63}$/` format guard; the browser control mirrors this list and a drift
 * test pins the two together.
 *
 * Labels are display vocabulary only — never a verdict, an accuracy claim or training data.
 */
export const FEEDBACK_REASON_CODES = [
  'wrong_category',
  'missed_scam',
  'false_alarm',
  'unclear_explanation',
  'other',
] as const;

export type FeedbackReasonCode = typeof FEEDBACK_REASON_CODES[number];

/** Plain-language labels shown next to each radio option. */
export const FEEDBACK_REASON_LABELS: Readonly<Record<FeedbackReasonCode, string>> = Object.freeze({
  wrong_category: 'Wrong category',
  missed_scam: 'Missed a scam',
  false_alarm: 'False alarm',
  unclear_explanation: 'Unclear explanation',
  other: 'Other',
});

/** Validate an untrusted value against the agreed vocabulary. */
export function isFeedbackReasonCode(value: unknown): value is FeedbackReasonCode {
  return typeof value === 'string' && (FEEDBACK_REASON_CODES as readonly string[]).includes(value);
}

/** Label for a validated reason code. */
export function feedbackReasonLabel(code: FeedbackReasonCode): string {
  return FEEDBACK_REASON_LABELS[code];
}
