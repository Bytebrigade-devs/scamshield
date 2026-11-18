/**
 * M4-07 — feedback store (library slice).
 *
 * Owner decision, 17 November 2026: feedback is an explicit "Report a wrong result" action.
 * The only stored fields are: check id, category, reason code and timestamp — never message
 * text/snippets, never a rating UI, never automatic training or confirmed ground truth.
 *
 * One feedback per (subject, check): re-reporting replaces the prior record (idempotent) and
 * never adds a duplicate count.
 *
 * HONESTY BOUNDARY: in-memory only. A restart forgets everything; there is no database,
 * Supabase call or network access. Feedback retention is still an open decision (OD-M4-05/07),
 * so this slice deliberately implements **no** automatic expiry; account deletion can remove
 * rows via `deleteAll`. A persistent store must implement the same operations later.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { CATEGORY_IDS, type CategoryId } from './taxonomy.ts';

export type FeedbackTrigger = 'wrong_result';

/** Bounded reason-code format; the actual code vocabulary is still to be agreed. */
const REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;

export interface FeedbackEntryInput {
  /** Server-derived subject (M2 verified user id); never browser-supplied authority. */
  subjectKey: string;
  /** Opaque id of the check the feedback refers to; no message content. */
  checkId: string;
  category: CategoryId;
  /** Bounded enum-like code (e.g. wrong_category); free text is not accepted. */
  reasonCode: string;
  /** Epoch ms when the feedback was submitted. */
  createdAt: number;
}

export interface FeedbackEntry extends FeedbackEntryInput {
  id: string;
  trigger: FeedbackTrigger;
}

export interface InMemoryFeedbackStoreOptions {
  now?: () => number;
}

export interface FeedbackStore {
  /** Idempotent upsert keyed by subject + check id; null for invalid input. */
  save(input: FeedbackEntryInput): FeedbackEntry | null;
  list(subjectKey: string): FeedbackEntry[];
  count(subjectKey: string): number;
  /** Account deletion / "remove my feedback": returns the number removed. */
  deleteAll(subjectKey: string): number;
}

function isNonEmptyString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** Create an in-memory feedback store (tests and local drafts; not durable). */
export function createInMemoryFeedbackStore(options: InMemoryFeedbackStoreOptions = {}): FeedbackStore {
  const entries = new Map<string, FeedbackEntry>();
  let nextId = 1;
  const storeKey = (subjectKey: string, checkId: string): string => `${subjectKey}\u0000${checkId}`;
  void options.now; // explicit `createdAt` is required; no hidden clock

  function save(input: FeedbackEntryInput): FeedbackEntry | null {
    if (!input || typeof input !== 'object') return null;
    if (!isNonEmptyString(input.subjectKey, 128)) return null;
    if (!isNonEmptyString(input.checkId, 128) || /\s/.test(input.checkId)) return null;
    if (!(CATEGORY_IDS as readonly string[]).includes(input.category)) return null;
    if (typeof input.reasonCode !== 'string' || !REASON_CODE.test(input.reasonCode)) return null;
    if (typeof input.createdAt !== 'number' || !Number.isFinite(input.createdAt) || input.createdAt <= 0) return null;

    const key = storeKey(input.subjectKey.trim(), input.checkId.trim());
    const existing = entries.get(key);
    const entry: FeedbackEntry = Object.freeze({
      id: existing?.id ?? `feedback-${nextId++}`,
      trigger: 'wrong_result',
      subjectKey: input.subjectKey.trim(),
      checkId: input.checkId.trim(),
      category: input.category,
      reasonCode: input.reasonCode,
      createdAt: input.createdAt,
    });
    entries.set(key, entry);
    return { ...entry };
  }

  function list(subjectKey: string): FeedbackEntry[] {
    if (!isNonEmptyString(subjectKey, 128)) return [];
    const key = subjectKey.trim();
    return [...entries.values()]
      .filter(entry => entry.subjectKey === key)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map(entry => ({ ...entry }));
  }

  function count(subjectKey: string): number {
    if (!isNonEmptyString(subjectKey, 128)) return 0;
    const key = subjectKey.trim();
    let total = 0;
    for (const entry of entries.values()) if (entry.subjectKey === key) total++;
    return total;
  }

  function deleteAll(subjectKey: string): number {
    if (!isNonEmptyString(subjectKey, 128)) return 0;
    const key = subjectKey.trim();
    let removed = 0;
    for (const [entryKey, entry] of entries) {
      if (entry.subjectKey === key) {
        entries.delete(entryKey);
        removed++;
      }
    }
    return removed;
  }

  return { save, list, count, deleteAll };
}
