/**
 * M4 — persist a completed check (and its history row) through the durable store.
 *
 * Why this module exists: `checker_feedback.check_id` is a foreign key to `scam_checks(id,
 * user_id)` and `user_id` is a real `auth.users` uuid, so a feedback row — or a history row —
 * can only exist if the check itself was stored under a verified subject first. This is that
 * single step, kept out of the check pipeline so the boundary stays free of database concerns.
 *
 * PRECONDITIONS (the caller owns them): the request was admitted, the outcome is `completed`,
 * and the subject key is a verified uuid. Nothing here re-checks entitlement.
 *
 * HONESTY BOUNDARY: only completed analyses are persisted. A `limited`/`unavailable` outcome has
 * no validated verdict and writes nothing. A failure here is returned, never thrown: the caller
 * decides to keep the analysed result and omit the feedback option (owner decision, 24 Nov 2026).
 */
import type { DurablePersistence } from '../boundary/durable-persistence.ts';
import type { CheckOutcome, VerdictLabel } from '../boundary/check-boundary.ts';
import type { StoredCheckInput, StoredFindingInput } from '../boundary/persistence-port.ts';
import { MAX_SNIPPET_CHARS, retentionDaysFor } from '../boundary/history-store.ts';
import { TAXONOMY_VERSION } from '../boundary/taxonomy.ts';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AnalysedOutcome = Extract<CheckOutcome, { kind: 'analysed' }>;

export interface PersistCompletedCheckInput {
  persistence: DurablePersistence;
  /** Server-generated opaque check id; the row identity the feedback FK will point at. */
  checkId: string;
  /** Verified subject (the M2 user uuid rendered as text). */
  subjectKey: string;
  planId: string;
  /** Entitlement expiry in epoch ms, from the resolved snapshot. */
  entitlementExpiresAt: number;
  /** The submitted message; only a bounded prefix is stored as the history snippet. */
  text: string;
  outcome: AnalysedOutcome;
  now: number;
}

export type PersistCompletedCheckResult =
  | { ok: true; checkId: string }
  | { ok: false; reason: string };

/**
 * Build the row and save it atomically (check + findings + history in one call). Returns a
 * reason instead of throwing for every refusal, so the caller can keep the AI result.
 */
export async function persistCompletedCheck(
  input: PersistCompletedCheckInput,
): Promise<PersistCompletedCheckResult> {
  if (!UUID.test(input.subjectKey.trim())) return { ok: false, reason: 'subject-not-a-uuid' };
  if (input.outcome.analysisStatus !== 'completed') return { ok: false, reason: 'not-completed' };

  const reply = input.outcome.reply;
  if (reply === null) return { ok: false, reason: 'no-validated-reply' };

  const retentionDays = retentionDaysFor(input.planId);
  if (retentionDays === null) return { ok: false, reason: 'plan-has-no-retention' };

  const snippet = input.text.trim().slice(0, MAX_SNIPPET_CHARS);
  if (snippet.length === 0) return { ok: false, reason: 'empty-snippet' };

  const findings: StoredFindingInput[] = input.outcome.rules.matches.map((match) => ({
    ruleId: match.ruleId,
    excerpt: match.excerpt,
    start: match.start,
    end: match.end,
    contextNote: match.contextNote ?? null,
  }));

  const row: StoredCheckInput = {
    checkId: input.checkId,
    subjectKey: input.subjectKey.trim(),
    planId: input.planId,
    createdAt: input.now,
    // Retention is the plan's window from now; `retentionDaysFor` is the agreed source.
    expiresAt: input.now + retentionDays * DAY_MS,
    analysisStatus: 'completed',
    analysisMode: input.outcome.analysisMode,
    categoryId: input.outcome.category,
    taxonomyVersion: TAXONOMY_VERSION,
    verdictLabel: reply.verdictLabel as VerdictLabel,
    riskLevel: reply.riskLevel,
    reason: reply.reason,
    reasonHighlights: reply.reasonHighlights,
    limitations: input.outcome.limitations,
    findings,
    history: { snippet, verdictLabel: reply.verdictLabel as VerdictLabel },
  };

  try {
    const saved = await input.persistence.checks.save(row);
    return saved === null ? { ok: false, reason: 'store-refused-row' } : { ok: true, checkId: saved.checkId };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'store-error' };
  }
}
