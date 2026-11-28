/**
 * M4 — X-13 event emitter.
 *
 * Builds one agreed `0.2.0-draft` event per accepted analysed outcome and appends it to a
 * sink. The opaque `subject_ref` is supplied server-side by the caller (the verified subject
 * key) — never browser-derived.
 *
 * The sink is **async** since 24 November 2026: the in-memory store answers immediately, and
 * the durable PostgREST store answers over the network. Making the seam async is what lets
 * one interface serve both without a fake synchronous wrapper around real I/O.
 *
 * HONESTY BOUNDARY: this stores events in the configured store only. There is NO queue and NO
 * delivery to M5 or any consumer; a durable row is a row, not a dashboard feed. Rejected
 * outcomes produce no event (X-13 §4.1).
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { buildCheckOutcomeEventV2, type CheckOutcomeEventV2 } from './x13-event.ts';
import type { CheckOutcome } from './check-boundary.ts';

/** Sink contract; both the async in-memory wrapper and the durable adapter satisfy it. */
export interface EventSink {
  append(event: CheckOutcomeEventV2): Promise<boolean>;
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
 * Emit one event for an accepted analysed outcome. Resolves false for a rejected outcome or
 * unusable context/reference (nothing is stored). Idempotent by event id via the sink.
 */
export async function emitCheckOutcome(
  sink: EventSink,
  outcome: CheckOutcome,
  ctx: EmitContext,
): Promise<boolean> {
  const event = buildCheckOutcomeEventV2(outcome, {
    eventId: ctx.eventId,
    occurredAt: ctx.occurredAt,
    subjectRef: ctx.subjectRef,
  });
  if (event === null) return false;
  return sink.append(event);
}
