/**
 * M4 — "Report a wrong result" support (M4-07).
 *
 * One module for both server surfaces (the workspace Node server and the shared-app route) so
 * they cannot drift.
 *
 * Design (owner-approved 18 November 2026): the check response carries a server-generated
 * opaque `checkId` plus the allowed reason codes; the browser never invents an id and carries no
 * message content.
 *
 * TWO STORES, ONE CONTRACT (owner decision 24 November 2026):
 *   - **memory** (default, and every deployment today): the report is validated against the
 *     bounded `tracked` map populated by `forOutcome`, exactly as before.
 *   - **durable** (only when constructed with a `feedbackPort` and a verified subject): the
 *     check must already exist in `scam_checks` for that subject — the foreign key on
 *     `checker_feedback(check_id, user_id)` is the ownership proof, so a forged or foreign id
 *     fails the read-back and is refused before any write. The `tracked` map is then not used:
 *     the persisted check id comes from the service, not from this module.
 *
 * HONESTY BOUNDARY: no message text, snippet or contact is ever stored. The durable path stores
 * only the check id, category, reason code and timestamp.
 */
import { randomUUID } from 'node:crypto';
import { createInMemoryFeedbackStore, type FeedbackEntry, type FeedbackStore } from '../boundary/feedback-store.ts';
import { FEEDBACK_REASON_CODES, isFeedbackReasonCode } from '../boundary/feedback-reason-codes.ts';
import type { CheckOutcome } from '../boundary/check-boundary.ts';
import type { DurablePersistence } from '../boundary/durable-persistence.ts';
import type { StoredCheck } from '../boundary/persistence-port.ts';

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
  /**
   * Attach to a check response; null for rejected/unreportable outcomes.
   *
   * `checkId` overrides the generated id — the service passes the **persisted** check id, and
   * that id is not added to the in-memory map (the durable store's foreign key proves ownership
   * instead). Without it the demo path generates and tracks an id as before.
   */
  forOutcome(outcome: CheckOutcome, subjectKey?: string, checkId?: string): FeedbackOption | null;
  /**
   * Validate and store a report. `subjectKey` is the verified subject of the caller, needed only
   * by the durable path; the in-memory path derives it from the tracked map.
   */
  report(body: unknown, subjectKey?: string): Promise<FeedbackReportResult>;
  /** Read-only in-memory view for tests; the durable path is read through the store. */
  entries(subjectKey?: string): readonly FeedbackEntry[];
}

export interface FeedbackSupportOptions {
  /** Server-derived subject; in the demo surfaces this is the fixed demo subject. */
  subjectKey: string;
  now?: () => number;
  store?: FeedbackStore;
  /** Durable feedback port. When absent, every report stays in memory. */
  feedbackPort?: DurablePersistence['feedback'];
  /** Reads an owned, unexpired check — the durable path's ownership proof. */
  readOwnedCheck?: (checkId: string, subjectKey: string, now: number) => Promise<StoredCheck | null>;
}

/**
 * Create the feedback support. All decisions stay server-side: the caller supplies the subject
 * key, and the only browser-supplied values are the echoed check id and a bounded reason code.
 */
export function createFeedbackSupport(options: FeedbackSupportOptions): FeedbackSupport {
  const store = options.store ?? createInMemoryFeedbackStore();
  const now = options.now ?? (() => Date.now());
  const tracked = new Map<string, { category: string; subjectKey: string }>(); // checkId -> check facts

  /** Server-derived subjects only: trimmed, non-empty, no whitespace, bounded. */
  function subjectFor(subjectKey: string | undefined): string | null {
    if (subjectKey === undefined) return options.subjectKey;
    if (typeof subjectKey !== 'string') return null;
    const trimmed = subjectKey.trim();
    if (trimmed.length === 0 || trimmed.length > 128 || /\s/.test(trimmed)) return null;
    return trimmed;
  }

  function forOutcome(outcome: CheckOutcome, subjectKey?: string, checkId?: string): FeedbackOption | null {
    if (!outcome || outcome.kind !== 'analysed') return null;
    const subject = subjectFor(subjectKey);
    if (subject === null) return null;
    // A persisted id comes from the durable store; the FK is its ownership proof, so it is not
    // added to the in-memory map (that would make `report` take the demo path).
    if (checkId !== undefined) return { checkId, reasonCodes: FEEDBACK_REASON_CODES };
    if (tracked.size >= MAX_TRACKED_CHECKS) {
      const oldest = tracked.keys().next().value;
      if (oldest !== undefined) tracked.delete(oldest);
    }
    const generated = randomUUID();
    tracked.set(generated, { category: outcome.category, subjectKey: subject });
    return { checkId: generated, reasonCodes: FEEDBACK_REASON_CODES };
  }

  function parseReport(body: unknown): { ok: true; checkId: string; reasonCode: string } | { ok: false; result: FeedbackReportResult } {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { ok: false, result: { status: 400, body: { error: 'bad-request' } } };
    }
    const keys = Object.keys(body);
    if (keys.length !== 2 || !keys.includes('checkId') || !keys.includes('reasonCode')) {
      return { ok: false, result: { status: 400, body: { error: 'bad-request' } } };
    }
    const record = body as Record<string, unknown>;
    if (typeof record.checkId !== 'string' || record.checkId.length === 0 || record.checkId.length > MAX_CHECK_ID_CHARS || /\s/.test(record.checkId)) {
      return { ok: false, result: { status: 400, body: { error: 'bad-request' } } };
    }
    if (!isFeedbackReasonCode(record.reasonCode)) {
      return { ok: false, result: { status: 400, body: { error: 'bad-reason-code' } } };
    }
    return { ok: true, checkId: record.checkId, reasonCode: record.reasonCode };
  }

  async function report(body: unknown, subjectKey?: string): Promise<FeedbackReportResult> {
    const parsed = parseReport(body);
    if (!parsed.ok) return parsed.result;
    const { checkId, reasonCode } = parsed;

    // Demo path: the id was issued by this process, so the tracked map proves ownership.
    const trackedCheck = tracked.get(checkId);
    if (trackedCheck !== undefined) {
      const entry = store.save({
        subjectKey: trackedCheck.subjectKey,
        checkId,
        category: trackedCheck.category as FeedbackEntry['category'],
        reasonCode,
        createdAt: now(),
      });
      if (entry === null) return { status: 500, body: { error: 'internal-error' } };
      return { status: 200, body: { accepted: true } };
    }

    // Durable path: a persisted id plus a verified subject. The owned-check read is the proof.
    const subject = subjectFor(subjectKey);
    const { feedbackPort, readOwnedCheck } = options;
    if (feedbackPort !== undefined && readOwnedCheck !== undefined && subject !== null && subjectKey !== undefined) {
      try {
        const check = await readOwnedCheck(checkId, subject, now());
        if (check === null) return { status: 404, body: { error: 'unknown-check' } };
        const saved = await feedbackPort.save({
          subjectKey: subject,
          checkId,
          category: check.categoryId,
          reasonCode,
          createdAt: now(),
        });
        if (saved === null) return { status: 500, body: { error: 'internal-error' } };
        return { status: 200, body: { accepted: true } };
      } catch {
        return { status: 500, body: { error: 'internal-error' } };
      }
    }

    return { status: 404, body: { error: 'unknown-check' } };
  }

  return {
    forOutcome,
    report,
    entries: (subjectKey?: string) => store.list(subjectKey ?? options.subjectKey),
  };
}
