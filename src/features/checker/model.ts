/**
 * M4 checker — pure UI model.
 *
 * Everything here is framework-free and server-safe apart from the two session-storage
 * helpers, which are guarded and only ever called from the client provider.
 *
 * The detection logic is not duplicated: `assessment.js`, `evidence.js`, `guidance.js` and
 * `summary.js` in `src/lib/scam-checker/ui/public/` stay the single source of truth and are
 * imported directly by the components. This file only owns what is specific to the mounted
 * React screen — the response shape it reads, history bookkeeping and input limits.
 */

// Relative rather than the `@/` alias on purpose: this module is pure, so `node --test` can run
// `tests/checker-model.test.ts` against it without a bundler or a path-alias loader.
import { CATEGORY_LABELS, MODE_LABELS, riskAssessment } from "../../lib/scam-checker/ui/public/assessment.js";

export type CheckerView = "input" | "result" | "history";

export type RiskLevel = "low" | "suspicious" | "high" | "undetermined";
export type AnalysisStatus = "completed" | "limited" | "unavailable";
export type AnalysisMode = "rules_and_ai" | "rules_only" | "none";

/** A stage-2 rule match. `start`/`end` are UTF-16 offsets into the submitted text. */
export interface RuleMatch {
  ruleId: string;
  excerpt: string;
  start: number;
  end: number;
  contextNote?: string;
}

export interface ReasonHighlight {
  start: number;
  end: number;
  excerpt: string;
}

/** The AI reply is present only when `analysisStatus === "completed"`. */
export interface ValidatedReply {
  verdictLabel: string;
  category: string;
  reason: string | null;
  riskLevel: RiskLevel;
  reasonHighlights: ReasonHighlight[];
}

export interface AnalysedOutcome {
  kind: "analysed";
  analysisStatus: AnalysisStatus;
  analysisMode: AnalysisMode;
  category: string;
  rules: { matches: RuleMatch[] };
  reply: ValidatedReply | null;
  limitations: string[];
}

export interface RejectedOutcome {
  kind: "rejected";
  reason: "invalid-input" | "access-blocked" | "quota-denied" | "rate-denied" | string;
  message: string;
}

export type CheckOutcome = AnalysedOutcome | RejectedOutcome;

export interface FeedbackOption {
  checkId: string;
  reasonCodes: string[];
}

export interface AiFailure {
  code: string;
  retryAfterSeconds?: number;
}

/**
 * The mounted route composes its body inline, so the browser contract is described here.
 * The four evidence payloads are typed loosely on purpose: their shape belongs to
 * `organization-verification.ts`, `sender-verification.ts`, `link-inspection.ts` and
 * `guidance-directory.ts`, and the cards narrow them where they read them.
 */
export interface CheckPayload {
  outcome: CheckOutcome;
  providerMode: "live" | "live-unconfigured";
  organizationVerification?: unknown;
  senderVerification?: unknown;
  linkInspection?: unknown;
  guidanceResources?: unknown;
  aiFailure?: AiFailure;
  feedback?: FeedbackOption;
  persistedCheckId?: string;
  persistenceFailure?: string;
}

export interface CheckerConfig {
  liveConfigured: boolean;
  limits: { inputCharCap: number };
  model?: string | null;
  api?: string | null;
  taxonomyVersion?: string;
}

/** An immutable record of one submitted check; later edits to the editor must not reach it. */
export interface SubmittedCheck {
  text: string;
  payload: CheckPayload;
  /** `createSummaryModel(...)` result — the allowlist projection used by the export card. */
  summary: unknown;
}

export const HISTORY_KEY = "scamshield-check-history-v2";
export const HISTORY_LIMIT = 20;
export const FALLBACK_CAP = 2000;
export const SENDER_MAX = 254;

export interface HistoryEntry {
  at: number;
  excerpt: string;
  category: string;
  assessment: string;
  mode: string;
}

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

/**
 * Shape/length/enum validation for anything read back out of session storage. Untrusted
 * input: a tampered entry must never reach the rendered history list.
 */
export function validHistoryEntry(entry: unknown): entry is HistoryEntry {
  if (entry === null || typeof entry !== "object") return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.at === "number" &&
    Number.isFinite(candidate.at) &&
    !Number.isNaN(new Date(candidate.at).getTime()) &&
    typeof candidate.excerpt === "string" &&
    candidate.excerpt.length <= 121 &&
    typeof candidate.assessment === "string" &&
    candidate.assessment.length <= 500 &&
    typeof candidate.category === "string" &&
    hasOwn(CATEGORY_LABELS, candidate.category) &&
    typeof candidate.mode === "string" &&
    hasOwn(MODE_LABELS, candidate.mode)
  );
}

/** Read the tab-session history. Denied/unavailable storage degrades to an empty list. */
export function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY) ?? "[]";
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validHistoryEntry).slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Persist the tab-session history. A denied write keeps the in-memory list working. */
export function writeHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const next = entries.slice(0, HISTORY_LIMIT);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* Storage can be denied; the current page keeps its in-memory list. */
    }
  }
  return next;
}

/** Configured cap, or the documented fallback when config is missing or malformed. */
export function inputCap(config: CheckerConfig | null): number {
  const cap = config?.limits?.inputCharCap;
  return typeof cap === "number" && Number.isInteger(cap) && cap > 0 ? cap : FALLBACK_CAP;
}

/**
 * Project an analysed payload into a history row. Raw message text never enters the entry
 * beyond the 120-character excerpt, which is what the user pasted and already knows.
 */
export function historyEntryFor(payload: CheckPayload, text: string, at: number): HistoryEntry {
  const outcome = payload.outcome as AnalysedOutcome;
  const collapsed = text.replace(/\s+/g, " ").trim();
  const category = hasOwn(CATEGORY_LABELS, outcome.category) ? outcome.category : "unknown_other";
  const assessment =
    outcome.analysisStatus === "completed"
      ? riskAssessment(outcome).heading
      : outcome.analysisStatus === "limited"
        ? "Limited message assessment"
        : "AI analysis failed";
  return {
    at,
    excerpt: collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed,
    category,
    assessment,
    mode: outcome.analysisMode,
  };
}

/** One retained server history row as served by `GET /api/history`. */
export interface ServerHistoryRow {
  createdAt: number;
  snippet: string;
  verdictLabel: string;
  category: string;
}

/**
 * Project a server history row into the UI shape. Only `completed` (AI) analyses are persisted
 * server-side, so the mode is `rules_and_ai`. The snippet is already caller-minimised; it is
 * collapsed and capped like the tab-session excerpt. Untrusted category falls back to unknown.
 */
export function historyEntryFromServer(row: ServerHistoryRow): HistoryEntry {
  const collapsed = row.snippet.replace(/\s+/g, " ").trim();
  const category = hasOwn(CATEGORY_LABELS, row.category) ? row.category : "unknown_other";
  return {
    at: row.createdAt,
    excerpt: collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed,
    category,
    assessment: row.verdictLabel,
    mode: "rules_and_ai",
  };
}

/**
 * The instant the summary is stamped with. Prefers the freshest review timestamp the server
 * supplied so the export matches the evidence it lists, and falls back to "now".
 */
export function summaryInstantFor(payload: CheckPayload): string {
  const candidates = [
    (payload.organizationVerification as { checkedAt?: unknown } | undefined)?.checkedAt,
    (payload.linkInspection as { checkedAt?: unknown } | undefined)?.checkedAt,
    (payload.guidanceResources as { checkedAt?: unknown } | undefined)?.checkedAt,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  }
  return new Date().toISOString();
}

/** Response-shape guard: anything else is treated as an unreadable result. */
export function isAnalysedOutcome(outcome: CheckOutcome | undefined): outcome is AnalysedOutcome {
  return (
    outcome?.kind === "analysed" &&
    (["completed", "limited", "unavailable"] as const).includes(outcome.analysisStatus) &&
    hasOwn(MODE_LABELS, outcome.analysisMode)
  );
}
