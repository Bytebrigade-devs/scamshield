/**
 * Persistence column-mapping tests: round-trips, timestamp conversion, normalization,
 * and the exact persisted column sets. Pure — no I/O, no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toTimestamptz, fromTimestamptz,
  checkInputToRow, rowToStoredCheck,
  findingInputToRow, rowToStoredFinding,
  historyToRow, rowToStoredHistory,
  feedbackToRow, rowToFeedback,
  eventToRow, rowToEvent,
} from './persistence-mapping.ts';
import type { StoredCheckInput, StoredHistoryEntry } from './persistence-port.ts';
import type { FeedbackEntry } from './feedback-store.ts';
import type { CheckOutcomeEvent } from './x13-event.ts';

const CREATED = Date.UTC(2026, 10, 19, 9, 0, 0);
const EXPIRES = CREATED + 30 * 86_400_000;

const CHECK_INPUT: StoredCheckInput = {
  checkId: 'chk-1',
  subjectKey: '  user-1  ',
  planId: '  Guardian  ',
  createdAt: CREATED,
  expiresAt: EXPIRES,
  analysisStatus: 'completed',
  analysisMode: 'rules_and_ai',
  categoryId: 'phishing',
  taxonomyVersion: '0.1.0-draft',
  verdictLabel: 'high risk',
  riskLevel: 'high',
  reason: 'Pressure plus credential request.',
  reasonHighlights: [{ start: 0, end: 8, excerpt: 'Pressure' }],
  limitations: ['Synthetic only.'],
  findings: [{ ruleId: ' R-M4-01 ', excerpt: 'suspended', start: 10, end: 19, contextNote: null }],
  history: { snippet: 'Your bank account will be suspended.', verdictLabel: 'high risk' },
};

test('timestamptz conversion round-trips epoch milliseconds', () => {
  const iso = toTimestamptz(CREATED);
  assert.equal(iso, '2026-11-19T09:00:00.000Z');
  assert.equal(fromTimestamptz(iso), CREATED);
  assert.ok(Number.isNaN(fromTimestamptz('not-a-date')));
});

test('check input maps to the exact scam_checks column set (no message text)', () => {
  const row = checkInputToRow(CHECK_INPUT);
  assert.deepEqual(Object.keys(row).sort(), [
    'analysis_mode', 'analysis_status', 'category_id', 'created_at', 'expires_at',
    'id', 'limitations', 'plan_id', 'reason', 'reason_highlights', 'risk_level',
    'taxonomy_version', 'user_id', 'verdict_label',
  ]);
  assert.equal(row.user_id, 'user-1');           // trimmed
  assert.equal(row.plan_id, 'guardian');          // trimmed + lowercased
  assert.equal(row.created_at, toTimestamptz(CREATED));
  assert.equal(row.expires_at, toTimestamptz(EXPIRES));
  assert.deepEqual(row.reason_highlights, [{ start: 0, end: 8, excerpt: 'Pressure' }]);
});

test('check row round-trips back to the normalized stored check', () => {
  const row = checkInputToRow(CHECK_INPUT);
  const findings = CHECK_INPUT.findings.map((f, i) => rowToStoredFinding(findingInputToRow(f, `finding-${i}`, 'chk-1', 'user-1')));
  const stored = rowToStoredCheck(row, findings, 'hist-1');
  assert.equal(stored.checkId, 'chk-1');
  assert.equal(stored.subjectKey, 'user-1');
  assert.equal(stored.planId, 'guardian');
  assert.equal(stored.createdAt, CREATED);
  assert.equal(stored.expiresAt, EXPIRES);
  assert.equal(stored.analysisStatus, 'completed');
  assert.equal(stored.analysisMode, 'rules_and_ai');
  assert.equal(stored.categoryId, 'phishing');
  assert.equal(stored.verdictLabel, 'high risk');
  assert.equal(stored.riskLevel, 'high');
  assert.equal(stored.reason, 'Pressure plus credential request.');
  assert.deepEqual(stored.reasonHighlights, [{ start: 0, end: 8, excerpt: 'Pressure' }]);
  assert.deepEqual(stored.limitations, ['Synthetic only.']);
  assert.equal(stored.historyId, 'hist-1');
  assert.equal(stored.findings.length, 1);
  assert.equal(stored.findings[0].ruleId, 'R-M4-01'); // trimmed
  assert.equal(stored.findings[0].start, 10);
  assert.equal(stored.findings[0].end, 19);
});

test('finding row round-trips with offsets and optional context note', () => {
  const row = findingInputToRow({ ruleId: 'R-M4-13', excerpt: 'win', start: 3, end: 6, contextNote: 'prize' }, 'f-9', 'chk-1', 'user-1');
  assert.equal(row.start_offset, 3);
  assert.equal(row.end_offset, 6);
  assert.equal(row.context_note, 'prize');
  const back = rowToStoredFinding(row);
  assert.equal(back.id, 'f-9');
  assert.equal(back.checkId, 'chk-1');
  assert.equal(back.ruleId, 'R-M4-13');
  assert.equal(back.start, 3);
  assert.equal(back.end, 6);
  assert.equal(back.contextNote, 'prize');
  const nullNote = findingInputToRow({ ruleId: 'R-M4-01', excerpt: 'x', start: 0, end: 1 }, 'f-10', 'chk-1', 'user-1');
  assert.equal(nullNote.context_note, null);
});

test('history row round-trips (snippet, verdict, category, retention)', () => {
  const entry: StoredHistoryEntry = {
    id: 'hist-1', checkId: 'chk-1', subjectKey: 'user-1', planId: 'guardian',
    createdAt: CREATED, expiresAt: EXPIRES, snippet: 'Your bank account will be suspended.',
    verdictLabel: 'high risk', category: 'phishing',
  };
  const row = historyToRow(entry);
  assert.equal(row.snippet, entry.snippet);
  assert.equal(row.category_id, 'phishing');
  const back = rowToStoredHistory(row);
  assert.deepEqual(back, entry);
});

test('feedback row round-trips with the fixed trigger and reason code', () => {
  const entry: FeedbackEntry = {
    id: 'fb-1', subjectKey: 'user-1', checkId: 'chk-1', category: 'phishing',
    reasonCode: 'false_alarm', trigger: 'wrong_result', createdAt: CREATED,
  };
  const row = feedbackToRow(entry);
  assert.equal(row.trigger, 'wrong_result');
  assert.equal(row.reason_code, 'false_alarm');
  assert.deepEqual(rowToFeedback(row), entry);
});

test('event row carries exactly the current eight fields (no unagreed reference)', () => {
  const event: CheckOutcomeEvent = {
    contract_version: '0.1.0-draft', event_type: 'm4.check_outcome', event_id: 'evt-1',
    occurred_at: '2026-11-19T09:00:00.000Z', taxonomy_version: '0.1.0-draft',
    category_id: 'phishing', analysis_status: 'completed', analysis_mode: 'rules_and_ai',
  };
  const row = eventToRow(event);
  assert.deepEqual(Object.keys(row).sort(), [
    'analysis_mode', 'analysis_status', 'category_id', 'contract_version',
    'event_id', 'event_type', 'occurred_at', 'taxonomy_version',
  ]);
  assert.deepEqual(rowToEvent(row), event);
});

test('event row carries the agreed subject_ref for 0.2.0-draft and round-trips', () => {
  const event = {
    contract_version: '0.2.0-draft', event_type: 'm4.check_outcome', event_id: 'evt-2',
    occurred_at: '2026-11-19T09:00:00.000Z', taxonomy_version: '0.1.0-draft',
    category_id: 'phishing', analysis_status: 'completed', analysis_mode: 'rules_and_ai',
    subject_ref: 'subj-9f3a',
  };
  const row = eventToRow(event);
  assert.equal(row.subject_ref, 'subj-9f3a');
  assert.deepEqual(Object.keys(row).sort(), [
    'analysis_mode', 'analysis_status', 'category_id', 'contract_version',
    'event_id', 'event_type', 'occurred_at', 'subject_ref', 'taxonomy_version',
  ]);
  assert.deepEqual(rowToEvent(row), event);
});
