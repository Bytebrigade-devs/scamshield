/**
 * M4-08 — history read policy + in-memory history store.
 *
 * Implements the owner-approved/team-agreed positions (15 November 2026, owner-reported):
 * - retention = the plan's 30/90/180-day window; records are deleted after it;
 * - the user can delete individual records or all of their own history;
 * - after a subscription ends, existing records stay readable (read-only) until retention
 *   ends — new checks are still blocked by `runCheck`, not by this module;
 * - account deletion removes all of that subject's records.
 *
 * HONESTY BOUNDARY: this is an in-memory library slice. A restart forgets everything; it is
 * not durable, not cross-instance and performs no database/Supabase call. A persistent store
 * must implement the same policy behind the same operations later. The store accepts only a
 * caller-minimised snippet (≤ 280 chars) and has no field for the full message text.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { DRAFT_VERDICT_LABELS } from './check-boundary.ts';
import type { EntitlementSnapshot, VerdictLabel } from './check-boundary.ts';
import { CATEGORY_IDS, type CategoryId } from './taxonomy.ts';

/** Agreed retention windows by plan; trial inherits Sentinel's 30 days (documented assumption). */
export const RETENTION_DAYS_BY_PLAN: Readonly<Record<string, number>> = Object.freeze({
  sentinel: 30,
  guardian: 90,
  aegis: 180,
  trial: 30,
});

export const MAX_SNIPPET_CHARS = 280;
const DAY_MS = 86_400_000;

/** Retention in days for a known plan/trial id; null = no agreed policy (do not save). */
export function retentionDaysFor(planId: string | null): number | null {
  if (typeof planId !== 'string') return null;
  return RETENTION_DAYS_BY_PLAN[planId.trim().toLowerCase()] ?? null;
}

/** Retention in milliseconds for a known plan id; null when unknown. */
export function retentionMsFor(planId: string | null): number | null {
  const days = retentionDaysFor(planId);
  return days === null ? null : days * DAY_MS;
}

export type HistoryReadAccess = 'full' | 'read-only' | 'none';

/**
 * Read policy for retained history:
 * - no snapshot / unverifiable expiry → `none`;
 * - active, trial or cancelled-before-expiry → `full`;
 * - expired, cancelled-after-expiry, suspended or past_due → `read-only` (retention still applies).
 */
export function historyReadAccess(snapshot: EntitlementSnapshot | null, now: number): HistoryReadAccess {
  if (snapshot === null || !Number.isFinite(snapshot.expiresAt)) return 'none';
  const stillValid = snapshot.expiresAt > now
    && (snapshot.status === 'active' || snapshot.status === 'trial' || snapshot.status === 'cancelled');
  return stillValid ? 'full' : 'read-only';
}

export interface HistoryEntryInput {
  /** Server-derived subject (M2 verified user id); never browser-supplied authority. */
  subjectKey: string;
  /** Plan id at the time of the check; drives retention. */
  planId: string;
  /** Epoch ms when the check result was accepted. */
  createdAt: number;
  /** Caller-minimised excerpt only; the full message text is never stored here. */
  snippet: string;
  verdictLabel: VerdictLabel;
  category: CategoryId;
}

export interface HistoryEntry extends HistoryEntryInput {
  /** Opaque store id; not derived from message content. */
  id: string;
}

export interface InMemoryHistoryStoreOptions {
  now?: () => number;
}

export interface HistoryStore {
  save(input: HistoryEntryInput): HistoryEntry | null;
  list(subjectKey: string, now: number): HistoryEntry[];
  deleteOne(subjectKey: string, id: string): boolean;
  deleteAll(subjectKey: string): number;
  purgeExpired(now: number): number;
}

function isNonEmptyString(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isExpired(entry: HistoryEntry, now: number): boolean {
  const retentionMs = retentionMsFor(entry.planId);
  if (retentionMs === null) return true; // unknown policy: never surface
  return now - entry.createdAt >= retentionMs;
}

/**
 * Create an in-memory history store. Suitable for tests and local drafts only; replace with a
 * persistent implementation before any durability claim.
 */
export function createInMemoryHistoryStore(options: InMemoryHistoryStoreOptions = {}): HistoryStore {
  const entries = new Map<string, HistoryEntry>();
  let nextId = 1;

  function save(input: HistoryEntryInput): HistoryEntry | null {
    if (!input || typeof input !== 'object') return null;
    if (!isNonEmptyString(input.subjectKey, 128)) return null;
    if (retentionDaysFor(input.planId) === null) return null;
    if (typeof input.createdAt !== 'number' || !Number.isFinite(input.createdAt) || input.createdAt <= 0) return null;
    if (typeof input.snippet !== 'string') return null;
    const trimmed = input.snippet.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_SNIPPET_CHARS) return null;
    if (!(DRAFT_VERDICT_LABELS as readonly string[]).includes(input.verdictLabel)) return null;
    if (!(CATEGORY_IDS as readonly string[]).includes(input.category)) return null;
    const entry: HistoryEntry = Object.freeze({
      id: `history-${nextId++}`,
      subjectKey: input.subjectKey.trim(),
      planId: input.planId.trim().toLowerCase(),
      createdAt: input.createdAt,
      snippet: trimmed,
      verdictLabel: input.verdictLabel,
      category: input.category,
    });
    entries.set(entry.id, entry);
    return { ...entry };
  }

  function list(subjectKey: string, now: number): HistoryEntry[] {
    if (!isNonEmptyString(subjectKey, 128) || !Number.isFinite(now)) return [];
    return [...entries.values()]
      .filter(entry => entry.subjectKey === subjectKey.trim() && !isExpired(entry, now))
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map(entry => ({ ...entry }));
  }

  function deleteOne(subjectKey: string, id: string): boolean {
    const entry = entries.get(id);
    if (!entry || entry.subjectKey !== subjectKey.trim()) return false;
    return entries.delete(id);
  }

  function deleteAll(subjectKey: string): number {
    const key = subjectKey.trim();
    let removed = 0;
    for (const [id, entry] of entries) {
      if (entry.subjectKey === key) {
        entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  function purgeExpired(now: number): number {
    if (!Number.isFinite(now)) return 0;
    let removed = 0;
    for (const [id, entry] of entries) {
      if (isExpired(entry, now)) {
        entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  // `now` is accepted for symmetry with future persistent stores; the in-memory slice needs
  // no clock because every operation takes an explicit `now` or `createdAt`.
  void options.now;

  return { save, list, deleteOne, deleteAll, purgeExpired };
}
