/**
 * M4 — reason-code vocabulary tests (M4-07 / OD-M4-07, 18 November 2026).
 *
 * Pins the owner-approved bounded enum: every code satisfies the feedback store's format guard,
 * free text is rejected, and labels exist for every code. Synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryFeedbackStore } from './feedback-store.ts';
import {
  FEEDBACK_REASON_CODES,
  FEEDBACK_REASON_LABELS,
  feedbackReasonLabel,
  isFeedbackReasonCode,
} from './feedback-reason-codes.ts';

const REASON_CODE_FORMAT = /^[a-z][a-z0-9_]{0,63}$/;

test('the five owner-approved codes are unique, format-safe and label-backed', () => {
  assert.equal(FEEDBACK_REASON_CODES.length, 5);
  assert.equal(new Set(FEEDBACK_REASON_CODES).size, 5);
  for (const code of FEEDBACK_REASON_CODES) {
    assert.match(code, REASON_CODE_FORMAT, `code must satisfy the store's format guard: ${code}`);
    assert.equal(typeof FEEDBACK_REASON_LABELS[code], 'string');
    assert.equal(feedbackReasonLabel(code), FEEDBACK_REASON_LABELS[code]);
  }
});

test('validation accepts only the agreed vocabulary, never free text', () => {
  for (const code of FEEDBACK_REASON_CODES) assert.equal(isFeedbackReasonCode(code), true);
  for (const value of ['Wrong Category', 'wrong category!', 'wrong-category', '', 'null', 42, null, undefined, 'wrong_category ']) {
    assert.equal(isFeedbackReasonCode(value), false, `must reject: ${String(value)}`);
  }
});

test('every agreed code passes the in-memory store end to end', () => {
  const store = createInMemoryFeedbackStore();
  for (const [index, code] of FEEDBACK_REASON_CODES.entries()) {
    const entry = store.save({
      subjectKey: 'subject-a',
      checkId: `check-${index}`,
      category: 'phishing',
      reasonCode: code,
      createdAt: 1_000 + index,
    });
    assert.ok(entry, `store must accept the agreed code: ${code}`);
  }
  assert.equal(store.count('subject-a'), 5);
});

test('the store still rejects reason codes outside the bounded format', () => {
  const store = createInMemoryFeedbackStore();
  const entry = store.save({ subjectKey: 'subject-a', checkId: 'check-x', category: 'phishing', reasonCode: 'not an agreed code!', createdAt: 1_000 });
  assert.equal(entry, null);
});
