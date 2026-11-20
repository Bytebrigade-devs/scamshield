/**
 * M4 — demo feedback endpoint support (M4-07, 18 November 2026).
 *
 * Wires the owner-decided "Report a wrong result" control to the in-memory feedback store on
 * both server surfaces — the workspace Node server and the shared-app route. One module so the
 * two surfaces cannot drift.
 *
 * Design (owner-approved 18 November 2026): the check response carries a server-generated
 * opaque `checkId` plus the allowed reason codes; the browser never invents an id and carries
 * no message content. The report is validated against a bounded in-memory map before storing.
 *
 * HONESTY BOUNDARY: storage is in-memory and process-local by design. A restart forgets
 * everything; durable persistence is gated on M2's RLS convention and the shared schema
 * (M2-J / TC-4). No message text, snippet or contact is ever stored.
 */
import { randomUUID } from 'node:crypto';
import { createInMemoryFeedbackStore, type FeedbackEntry, type FeedbackStore } from '../boundary/feedback-store.ts';
import { FEEDBACK_REASON_CODES, isFeedbackReasonCode } from '../boundary/feedback-reason-codes.ts';
import type { CheckOutcome } from '../boundary/check-boundary.ts';

/** Bounded FIFO: the oldest tracked check id is forgotten, not silently kept forever. */
export const MAX_TRACKED_CHECKS = 1_024;
const MAX_CHECK_ID_CHARS = 128;

export interface FeedbackOption {
  /** Opaque id the browser may echo back; null when the outcome cannot be reported. */
  checkId: string;
  reasonCodes: readonly string[];
}

export interface FeedbackReportResult {
  status: number;
  body: { accepted?: boolean; error?: string };
}

export interface FeedbackSupport {
  /** Attach to a `GET /api/check`-style response; null for rejected/unreportable outcomes. */
  forOutcome(outcome: CheckOutcome): FeedbackOption | null;
  /** Validate and store a `{ checkId, reasonCode }` report. */
  report(body: unknown): FeedbackReportResult;
  /** Read-only view for tests; never exposed over HTTP. */
  entries(): readonly FeedbackEntry[];
}

export interface FeedbackSupportOptions {
  /** Server-derived subject; in the demo surfaces this is the fixed demo subject. */
  subjectKey: string;
  now?: () => number;
  store?: FeedbackStore;
}

/**
 * Create the feedback support. All decisions stay server-side: the caller supplies the subject
 * key, and the only browser-supplied values are the echoed check id and a bounded reason code.
 */
export function createFeedbackSupport(options: FeedbackSupportOptions): FeedbackSupport {
  const store = options.store ?? createInMemoryFeedbackStore();
  const now = options.now ?? (() => Date.now());
  const tracked = new Map<string, string>(); // checkId -> category

  function forOutcome(outcome: CheckOutcome): FeedbackOption | null {
    if (!outcome || outcome.kind !== 'analysed') return null;
    if (tracked.size >= MAX_TRACKED_CHECKS) {
      const oldest = tracked.keys().next().value;
      if (oldest !== undefined) tracked.delete(oldest);
    }
    const checkId = randomUUID();
    tracked.set(checkId, outcome.category);
    return { checkId, reasonCodes: FEEDBACK_REASON_CODES };
  }

  function report(body: unknown): FeedbackReportResult {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { status: 400, body: { error: 'bad-request' } };
    }
    const keys = Object.keys(body);
    if (keys.length !== 2 || !keys.includes('checkId') || !keys.includes('reasonCode')) {
      return { status: 400, body: { error: 'bad-request' } };
    }
    const record = body as Record<string, unknown>;
    if (typeof record.checkId !== 'string' || record.checkId.length === 0 || record.checkId.length > MAX_CHECK_ID_CHARS || /\s/.test(record.checkId)) {
      return { status: 400, body: { error: 'bad-request' } };
    }
    if (!isFeedbackReasonCode(record.reasonCode)) {
      return { status: 400, body: { error: 'bad-reason-code' } };
    }
    const category = tracked.get(record.checkId);
    if (category === undefined) {
      return { status: 404, body: { error: 'unknown-check' } };
    }
    const entry = store.save({
      subjectKey: options.subjectKey,
      checkId: record.checkId,
      category: category as FeedbackEntry['category'],
      reasonCode: record.reasonCode,
      createdAt: now(),
    });
    if (entry === null) return { status: 500, body: { error: 'internal-error' } };
    return { status: 200, body: { accepted: true } };
  }

  return {
    forOutcome,
    report,
    entries: () => store.list(options.subjectKey),
  };
}
