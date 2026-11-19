/**
 * M4 — event emitter tests (in-memory sink; no delivery).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCheckOutcome } from './event-emitter.ts';
import { createInMemoryPersistence } from './persistence-port.ts';
import type { CheckOutcome } from './check-boundary.ts';

const CTX = { subjectRef: 'subj-9f3a', eventId: 'evt-emit-1', occurredAt: '2026-11-19T12:00:00.000Z' };

function analysed(analysisStatus: 'completed' | 'limited' | 'unavailable' = 'completed'): CheckOutcome {
  return {
    kind: 'analysed',
    analysisStatus,
    analysisMode: analysisStatus === 'completed' ? 'rules_and_ai' : analysisStatus === 'limited' ? 'rules_only' : 'none',
    category: 'phishing',
    candidates: { urls: [], emails: [], phones: [] },
    rules: { matches: [] },
    reply: null,
    limitations: [],
  };
}

test('emits one 0.2.0-draft event for an accepted analysed outcome', () => {
  const port = createInMemoryPersistence();
  assert.equal(emitCheckOutcome(port.events, analysed(), CTX), true);
  const [stored] = port.events.listAll();
  assert.equal(stored.contract_version, '0.2.0-draft');
  assert.equal((stored as { subject_ref?: string }).subject_ref, 'subj-9f3a');
  assert.equal(stored.event_id, 'evt-emit-1');
});

test('a rejected outcome emits nothing', () => {
  const port = createInMemoryPersistence();
  const rejected: CheckOutcome = { kind: 'rejected', reason: 'quota-denied', message: 'limit' };
  assert.equal(emitCheckOutcome(port.events, rejected, CTX), false);
  assert.equal(port.events.listAll().length, 0);
});

test('an unusable reference emits nothing', () => {
  const port = createInMemoryPersistence();
  assert.equal(emitCheckOutcome(port.events, analysed(), { ...CTX, subjectRef: 'user@example.com' }), false);
  assert.equal(port.events.listAll().length, 0);
});

test('re-emitting the same event id is idempotent (one stored event)', () => {
  const port = createInMemoryPersistence();
  assert.equal(emitCheckOutcome(port.events, analysed(), CTX), true);
  assert.equal(emitCheckOutcome(port.events, analysed(), CTX), true);
  assert.equal(port.events.listAll().length, 1);
});

test('an unavailable outcome still emits, categorised unknown_other', () => {
  const port = createInMemoryPersistence();
  assert.equal(emitCheckOutcome(port.events, analysed('unavailable'), { ...CTX, eventId: 'evt-emit-2' }), true);
  const [stored] = port.events.listAll();
  assert.equal(stored.category_id, 'unknown_other');
  assert.equal(stored.analysis_status, 'unavailable');
});
