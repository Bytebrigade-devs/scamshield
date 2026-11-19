/**
 * M4 — X-13 event emitter (in-memory sink; no delivery).
 *
 * Builds one agreed `0.2.0-draft` event per accepted analysed outcome and appends it to a
 * local sink (the persistence port's event store). The opaque `subject_ref` is supplied
 * server-side by the caller (the verified subject key) — never browser-derived.
 *
 * HONESTY BOUNDARY: this stores events locally only. There is NO network, NO queue and NO
 * delivery to M5 or any consumer; wiring a real transport is later work gated on the approved
 * database. Rejected outcomes produce no event (X-13 §4.1).
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { buildCheckOutcomeEventV2, type CheckOutcomeEventV2 } from './x13-event.ts';
import type { CheckOutcome } from './check-boundary.ts';

/** Minimal local sink; the persistence port's `events` object satisfies this structurally. */
export interface EventSink {
  append(event: CheckOutcomeEventV2): boolean;
}

export interface EmitContext {
  /** Opaque server-derived per-user reference (the verified subject key). */
  subjectRef: unknown;
  /** Producer-generated opaque event id; stable across retries. */
  eventId: unknown;
  /** UTC RFC-3339 terminal check time. */
  occurredAt: unknown;
}

/**
 * Emit one event for an accepted analysed outcome. Returns false for a rejected outcome or
 * unusable context/reference (nothing is stored). Idempotent by event id via the sink.
 */
export function emitCheckOutcome(sink: EventSink, outcome: CheckOutcome, ctx: EmitContext): boolean {
  const event = buildCheckOutcomeEventV2(outcome, {
    eventId: ctx.eventId,
    occurredAt: ctx.occurredAt,
    subjectRef: ctx.subjectRef,
  });
  if (event === null) return false;
  return sink.append(event);
}
