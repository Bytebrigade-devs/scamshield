/**
 * M4 — X-13 taxonomy source of truth (M4-10).
 *
 * One place for the five category IDs, display labels and taxonomy version so the boundary,
 * the X-13 event builder and tests cannot drift. Browser UI copy lives outside this library;
 * only the IDs/labels/version here are exported.
 *
 * These are the M4-owner-accepted `0.1.0-draft` proposals, not a frozen shared contract.
 * Labels are display vocabulary only, never a safety or incident claim.
 */

export const TAXONOMY_VERSION = '0.1.0-draft';

export const CATEGORY_IDS = [
  'phishing',
  'romance_scam',
  'fake_invoice',
  'prize_lottery_scam',
  'unknown_other',
] as const;

export type CategoryId = typeof CATEGORY_IDS[number];

/** Display labels (X-13 §2.1); `unknown_other` is "not classified", never "safe". */
export const CATEGORY_LABELS: Readonly<Record<CategoryId, string>> = Object.freeze({
  phishing: 'Phishing',
  romance_scam: 'Romance scam',
  fake_invoice: 'Fake invoice',
  prize_lottery_scam: 'Prize / lottery scam',
  unknown_other: 'Not classified',
});

/**
 * Map an untrusted category value to the reviewed vocabulary. Absent, unrecognised or
 * ambiguous values become `unknown_other`; the caller decides whether a non-string is a
 * malformed reply (the boundary rejects it) or just an absent category (fallback).
 */
export function normaliseCategory(value: unknown): CategoryId {
  if (typeof value !== 'string') return 'unknown_other';
  const normalized = value.trim().toLowerCase();
  return (CATEGORY_IDS as readonly string[]).includes(normalized)
    ? normalized as CategoryId
    : 'unknown_other';
}

/** Label for a validated category ID. */
export function categoryLabel(id: CategoryId): string {
  return CATEGORY_LABELS[id];
}
