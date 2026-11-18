/**
 * M4 — feedback control drift guard (M4-07, 18 November 2026).
 *
 * The browser control in `public/feedback.js` must mirror the owner-approved reason-code
 * vocabulary in `boundary/feedback-reason-codes.ts` exactly. This test pins the constants and
 * the rendered control: one radio per code, inert labels, ids for app.js wiring, no anchors,
 * and honest confirmation/failure text. Synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_REASON_CODES, FEEDBACK_REASON_LABELS } from '../boundary/feedback-reason-codes.ts';
import {
  FEEDBACK_REASON_CODES as JS_CODES,
  FEEDBACK_REASON_LABELS as JS_LABELS,
  FEEDBACK_TITLE,
  feedbackControl,
  feedbackFailedText,
  feedbackModel,
  feedbackSubmittedText,
} from './public/feedback.js';

function node(tag: string, attrs: any = {}, children: any = []) {
  return { tag, attrs, children: [].concat(children).filter(item => item !== null && item !== undefined), append(...values: any[]) { this.children.push(...values.filter(item => item !== null && item !== undefined)); } };
}
function flatten(value: any): any[] { return typeof value === 'object' && value ? [value, ...value.children.flatMap(flatten)] : []; }
function text(value: any): string { return typeof value === 'string' ? value : value?.children?.map(text).join(' ') ?? ''; }

test('the browser vocabulary matches the owner-approved codes and labels byte-for-byte', () => {
  assert.deepEqual(JS_CODES, FEEDBACK_REASON_CODES);
  assert.deepEqual(JS_LABELS, FEEDBACK_REASON_LABELS);
});

test('the control renders one labelled radio per code with wiring ids and no anchors', () => {
  const card = feedbackControl({ checkId: 'check-1', reasonCodes: FEEDBACK_REASON_CODES }, node)!;
  assert.ok(card);
  assert.equal(flatten(card)[0].attrs['data-testid'], 'feedback');
  const radios = flatten(card).filter(item => item.tag === 'input' && item.attrs.type === 'radio');
  assert.deepEqual(radios.map(radio => radio.attrs.value), FEEDBACK_REASON_CODES);
  for (const radio of radios) {
    assert.equal(radio.attrs.name, 'feedback-reason');
    assert.match(radio.attrs.id, /^feedback-reason-/);
  }
  for (const code of FEEDBACK_REASON_CODES) assert.ok(text(card).includes(FEEDBACK_REASON_LABELS[code]), `label missing: ${code}`);
  assert.ok(text(card).includes(FEEDBACK_TITLE), 'the card title must match the exported constant');
  assert.equal(flatten(card).filter(item => item.tag === 'a').length, 0);
  assert.ok(flatten(card).some(item => item.attrs.id === 'feedback-submit'));
  assert.ok(flatten(card).some(item => item.attrs.id === 'feedback-status'));
  assert.match(text(card), /never your message text/);
  assert.match(text(card), /in-memory and resets on restart/);
});

test('the control hides when the payload carries no reportable check or unknown codes', () => {
  assert.equal(feedbackControl(null, node), null);
  assert.equal(feedbackControl({}, node), null);
  assert.equal(feedbackControl({ checkId: '', reasonCodes: FEEDBACK_REASON_CODES }, node), null);
  assert.equal(feedbackControl({ checkId: 'check-1' }, node), null);
  assert.equal(feedbackControl({ checkId: 'check-1', reasonCodes: [] }, node), null);
  assert.equal(feedbackControl({ checkId: 'check-1', reasonCodes: 'nope' }, node), null);
  const hostile = feedbackControl({ checkId: 'check-1', reasonCodes: ['wrong_category', 'evil <b>code</b>'] }, node)!;
  assert.ok(hostile, 'unknown codes are filtered, known ones kept');
  const radios = flatten(hostile).filter(item => item.tag === 'input' && item.attrs.type === 'radio');
  assert.deepEqual(radios.map(radio => radio.attrs.value), ['wrong_category']);
  assert.doesNotMatch(text(hostile), /<b>/);
});

test('confirmation and failure texts are honest and code-scoped', () => {
  assert.match(feedbackSubmittedText('missed_scam'), /Missed a scam/);
  assert.match(feedbackSubmittedText('missed_scam'), /Nothing about your message was stored/);
  assert.match(feedbackSubmittedText(String('evil <b>')), /evil/, 'unknown labels fall back to the raw code as inert text');
  assert.match(feedbackFailedText(), /could not be saved/);
  assert.match(feedbackFailedText(), /Nothing was sent or stored/);
});

test('feedbackModel accepts only well-formed server options', () => {
  assert.deepEqual(feedbackModel({ checkId: 'check-1', reasonCodes: ['other'] }), { checkId: 'check-1', reasonCodes: ['other'] });
  assert.equal(feedbackModel({ checkId: 'has space', reasonCodes: ['other'] }), null);
  assert.equal(feedbackModel({ checkId: 'check-1', reasonCodes: {} }), null);
});
