/**
 * M4-02 — Server-side check boundary (API/route service core).
 *
 * Requirements: FR-M4-04 — "AI analysis shall be invoked through the server and its returned
 * structured verdict shall be validated before use... invalid output cannot become a successful
 * AI result"; FR-M4-01 (server-side input validation); FS-M4-02 (size-cap rejection, no
 * truncation); FS-M4-08 (denial declines the provider call, no bypass); FS-M4-09 (server-enforced
 * protected access); FS-M4-05/06 (missing key / provider failure handling); NFR-M4-01
 * (server-secret boundary), NFR-M4-02 (server-side authorization), NFR-M4-09 (controlled
 * provider usage), NFR-M4-10 (honest partial failure — failures never count as successes).
 *
 * HONESTY BOUNDARY (load-bearing):
 * 1. NO live provider call is authorized by this work: X-09 (written funding arrangement,
 *    verified cap/alert) stays open, so the provider is an injected port. This module never
 *    fetches, holds no key and reads no environment.
 * 2. The reply schema below is a DRAFT structural contract — verdict labels, semantics and
 *    confidence remain OD-M4-04 (open). Only structure is validated, never truth, and an
 *    invalid reply is never "repaired" into a successful AI result.
 * 3. No verdict/score/category is attributed to rule matches (stage-2 design rule); a
 *    completed verdict comes only from a validated provider reply.
 * 4. Nothing is emitted anywhere: an analysed result carries the fields a future X-13
 *    `m4.check_outcome` emitter will need (X-13 §4.1), but delivery awaits consumer agreement
 *    (X13-OD-02). Rejected checks produce no event and no count (X-13 §4.1: no event for
 *    input/auth/quota rejection before a check is accepted).
 *
 * Design rules (each pinned by check-boundary.test.ts):
 * 1. Zero imports — a pure, portable service. Stage functions, entitlement, usage, budget,
 *    provider and clock are all injected, so this file is byte-identical to the repository
 *    copy and never itself performs network I/O.
 * 2. The request carries ONLY `text`. There is no field through which a browser-supplied
 *    identifier could become authority (NFR-M4-02, FS-M4-08): identity and quota keying come
 *    solely from the server-side entitlement snapshot.
 * 3. Validation → access → usage gates run BEFORE any provider call; every rejection path is
 *    terminal, carries a safe user message and records zero provider calls.
 * 4. Missing key (provider "unconfigured") or an unpermitted budget disables the live call
 *    and yields an explicitly LABELLED rules-only limited result (FS-M4-05) — never a
 *    fabricated or implied completed AI verdict and never a safety conclusion.
 * 5. Exactly one provider attempt on one model — no retry, no fallback model (owner decision
 *    19 Oct 2026); failure, timeout or invalid output ends in `unavailable` with category
 *    `unknown_other`, which is not a "safe" outcome.
 * 6. Only a completed analysis is counted (NFR-M4-10); rejected, denied and failed checks
 *    never consume quota. No duplicate/count policy is invented here (OD-M4-06 stays open).
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */

// ---- injected stage contracts (structurally compatible with the M4-03/M4-04 libraries) ----

/** Untrusted stage-1 candidates (shape of preprocess `ExtractionCandidates`). Not verified identities. */
export interface StageCandidates {
  urls: string[];
  emails: string[];
  phones: string[];
}

/** Stage-2 rule evidence (shape of rule-engine `RuleMatch`). NO verdict/score/category, by design. */
export interface StageRuleMatch {
  ruleId: string;
  excerpt: string;
  /** UTF-16 offsets into the analysed text; `text.slice(start, end) === excerpt`. */
  start: number;
  end: number;
  contextNote?: string;
}

export interface StageRules {
  matches: StageRuleMatch[];
}

export type ExtractFn = (text: string) => StageCandidates;
export type AnalyzeRulesFn = (text: string) => StageRules;

// ---- X-13 taxonomy constants (contracts/X-13-taxonomy-and-summary-contract.md §2) ----

export const TAXONOMY_VERSION = '0.1.0-draft';
export const CONTRACT_VERSION = '0.1.0-draft';

export type CategoryId =
  | 'phishing'
  | 'romance_scam'
  | 'fake_invoice'
  | 'prize_lottery_scam'
  | 'unknown_other';

const CATEGORY_IDS: readonly string[] = [
  'phishing',
  'romance_scam',
  'fake_invoice',
  'prize_lottery_scam',
  'unknown_other',
];

const SUPPORTED_TAXONOMY_VERSIONS: readonly string[] = [TAXONOMY_VERSION];

// ---- confirmed limits and plan quotas (M4-usage-quotas-and-funding-decision.md §1, 18 Oct 2026) ----

export interface BoundaryLimits {
  /** Uniform input cap in UTF-16 code units (FS-M4-02 / FR-M4-01): limit and limit + 1 are tested. */
  inputCharCap: number;
  /** Burst guard: ≈5 accepted checks per minute per user. */
  burstWindowMs: number;
  burstMax: number;
}

export const DEFAULT_LIMITS: BoundaryLimits = { inputCharCap: 2_000, burstWindowMs: 60_000, burstMax: 5 };

export interface Allowance {
  monthly: number;
  daily: number;
}

/**
 * Confirmed quotas (decision record §1): Sentinel 60/month · 5/day, Guardian 200 · 15,
 * Aegis 600 · 40, trial 15 checks / 7 days. Trial enforcement here is ≤ 15 per calendar
 * month as draft semantics — the 7-day trial window boundary itself is the entitlement
 * layer's responsibility; exact duplicate/count policy remains OD-M4-06 (open).
 */
export const PLAN_ALLOWANCES: Readonly<Record<string, Allowance>> = {
  sentinel: { monthly: 60, daily: 5 },
  guardian: { monthly: 200, daily: 15 },
  aegis: { monthly: 600, daily: 40 },
  trial: { monthly: 15, daily: 15 },
};

// ---- ports ----

export type EntitlementStatus = 'active' | 'trial' | 'cancelled' | 'suspended' | 'past_due';

/**
 * Server-side authoritative snapshot. The M2 contract (plan id + status + expiry) is still
 * open (OD-M4-01) — this port records what M4 needs from it, without inventing M2's API
 * shape. `subjectKey` is a server-derived stable identity, never taken from the browser.
 */
export interface EntitlementSnapshot {
  subjectKey: string;
  planId: string;
  status: EntitlementStatus;
  /** Epoch ms. An entitlement whose expiry cannot be verified never authorizes a paid call. */
  expiresAt: number;
}

export interface EntitlementPort {
  /** null = missing/unverifiable session (FS-M4-09) → block, no provider call. */
  getEntitlement(session: unknown): EntitlementSnapshot | null;
}

export type UsageDenialReason = 'quota-monthly' | 'quota-daily' | 'rate-burst';

export interface UsageDenial {
  reason: UsageDenialReason;
  message: string;
}

export interface UsageSubject {
  key: string;
  allowance: Allowance;
}

export interface UsagePort {
  /**
   * Gate plus burst recording, atomically: null = admitted (the attempt is recorded in the
   * burst window only); a denial records nothing. A denial must decline the provider call
   * entirely (FS-M4-08).
   */
  admitCheck(subject: UsageSubject, now: number): UsageDenial | null;
  /** Count one completed analysis (NFR-M4-10) — the ONLY entry point that consumes quota. */
  recordCompletion(subject: { key: string }, now: number): void;
}

export interface BudgetDecision {
  permitted: boolean;
  reason?: 'unfunded' | 'cap-reached' | 'unverified';
}

export interface BudgetPort {
  /**
   * X-09: a written funding/spend arrangement with a verified provider-side cap/alert must
   * permit live calls. Unpermitted → the boundary returns its labelled rules-only result.
   */
  isProviderCallPermitted(): BudgetDecision;
}

export type ProviderFailure = 'timeout' | 'network' | 'http-error' | 'bad-json';

export type ProviderAttempt =
  | { kind: 'ok'; json: unknown }
  | { kind: 'unconfigured' }
  | { kind: 'failed'; failure: ProviderFailure };

export interface ProviderPort {
  /** Exactly one attempt on one model. No retry, no fallback model (owner decision 19 Oct 2026). */
  analyze(text: string): Promise<ProviderAttempt>;
}

export interface ClockPort {
  now(): number;
}

// ---- outcome model (X-13 §4.1 valid pairs only) ----

export type AnalysisStatus = 'completed' | 'limited' | 'unavailable';
export type AnalysisMode = 'rules_and_ai' | 'rules_only' | 'none';

export type RejectionReason = 'invalid-input' | 'access-blocked' | 'quota-denied' | 'rate-denied';

/** DRAFT structural reply (OD-M4-04 open): field presence/types only — semantics unvalidated. */
export interface ValidatedReply {
  verdictLabel: string;
  category: CategoryId;
  reason: string | null;
}

export type CheckOutcome =
  | { kind: 'rejected'; reason: RejectionReason; message: string }
  | {
      kind: 'analysed';
      /** completed ⇒ rules_and_ai · limited ⇒ rules_only · unavailable ⇒ none (X-13 §4.1). */
      analysisStatus: AnalysisStatus;
      analysisMode: AnalysisMode;
      /** `unknown_other` unless a validated reply supplies a reviewed category. */
      category: CategoryId;
      /** Untrusted stage-1 candidates for display; never exported as analytics (FR-M4-15). */
      candidates: StageCandidates;
      /** Stage-2 evidence only — never a verdict, score or incident claim. */
      rules: StageRules;
      /** Present only when analysisStatus === 'completed'. */
      reply: ValidatedReply | null;
      /** Honest limitations shown with the result (FR-M4-05); empty only for completed. */
      limitations: string[];
    };

export interface CheckRequest {
  /** The ONLY accepted request field (design rule 2). Unvalidated until rule 3 of runCheck. */
  text: unknown;
}

export interface CheckDeps {
  /** Opaque server-verified session context; only the entitlement port interprets it. */
  session: unknown;
  extract: ExtractFn;
  analyzeRules: AnalyzeRulesFn;
  entitlement: EntitlementPort;
  usage: UsagePort;
  budget: BudgetPort;
  provider: ProviderPort;
  clock: ClockPort;
  limits?: BoundaryLimits;
}

// ---- safe user-facing messages (draft wording; reviewed copy is a later UI concern) ----

export const EMPTY_INPUT_MESSAGE = 'Paste the message text you want checked. The check needs some text to analyse.';
export const ACCESS_BLOCKED_MESSAGE = 'A currently valid plan or trial is required to run a check.';
export const RULES_ONLY_LIMITATION =
  'AI analysis was not completed: this result is based on local rules only and draws no safety conclusion.';
export const UNAVAILABLE_LIMITATION =
  'No usable analysis result is available. This is not a safety verdict; verify independently through official channels.';

// ---- access mapping (contracts/M4-access-policy-decision.md) ----

export type AccessDecision = { allowed: true; allowance: Allowance } | { allowed: false };

/**
 * active/trial → allow while the entitlement expiry is verified and in the future;
 * cancelled → allow strictly until expiry ("access until entitlement expiry"); suspended,
 * past-due, expired or unverifiable → block; unknown plan ids get no invented quota
 * (OD-M4-01: consume the agreed contract, do not invent subscription rules).
 */
export function resolveAccess(snapshot: EntitlementSnapshot | null, now: number): AccessDecision {
  if (snapshot === null) return { allowed: false };
  if (typeof snapshot.expiresAt !== 'number' || !Number.isFinite(snapshot.expiresAt)) return { allowed: false };
  const withinEntitlement = snapshot.expiresAt > now;
  let statusAllows = false;
  if (snapshot.status === 'active' || snapshot.status === 'trial') statusAllows = true;
  else if (snapshot.status === 'cancelled') statusAllows = withinEntitlement;
  if (!statusAllows || !withinEntitlement) return { allowed: false };
  const allowance = snapshot.status === 'trial'
    ? PLAN_ALLOWANCES.trial
    : PLAN_ALLOWANCES[typeof snapshot.planId === 'string' ? snapshot.planId.trim().toLowerCase() : ''];
  if (allowance === undefined) return { allowed: false };
  return { allowed: true, allowance };
}

// ---- FR-M4-04 structural reply validation (DRAFT schema, OD-M4-04 open) ----

/**
 * Validates only object shape, required field presence/primitive types, the supported
 * taxonomy version (an unsupported version is rejected at the boundary — X-13 §2.2) and the
 * X-13 category mapping with the `unknown_other` fallback (X-13 §2.1: absent, unrecognized
 * or ambiguous category output is never a "safe" label and never fails open to free text).
 * Returns null when the reply cannot become a successful AI result.
 */
export function validateReply(json: unknown): ValidatedReply | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const reply = json as Record<string, unknown>;
  if (typeof reply.verdict !== 'string' || reply.verdict.trim().length === 0) return null;
  if (
    typeof reply.taxonomy_version !== 'string' ||
    !SUPPORTED_TAXONOMY_VERSIONS.includes(reply.taxonomy_version)
  ) {
    return null;
  }
  if (reply.reason !== undefined && reply.reason !== null && typeof reply.reason !== 'string') return null;
  let category: CategoryId = 'unknown_other';
  if (reply.category !== undefined) {
    if (typeof reply.category !== 'string') return null;
    const normalized = reply.category.trim().toLowerCase();
    if (CATEGORY_IDS.includes(normalized)) category = normalized as CategoryId;
  }
  return {
    verdictLabel: reply.verdict.trim(),
    category,
    reason: typeof reply.reason === 'string' ? reply.reason : null,
  };
}

// ---- the check boundary itself ----

function rejected(reason: RejectionReason, message: string): CheckOutcome {
  return { kind: 'rejected', reason, message };
}

function analysed(
  analysisStatus: AnalysisStatus,
  analysisMode: AnalysisMode,
  category: CategoryId,
  candidates: StageCandidates,
  rules: StageRules,
  reply: ValidatedReply | null,
  limitations: string[],
): CheckOutcome {
  return { kind: 'analysed', analysisStatus, analysisMode, category, candidates, rules, reply, limitations };
}

/**
 * Run one scam check through the server-side boundary:
 * validate input → resolve access → gate usage → stages 1–2 → (only if entitled, within
 * limits, budget-permitted and configured) one provider attempt → validate the reply →
 * assemble an honest result. Never throws for bad input; every rejection is terminal with
 * zero provider calls. Rejected outcomes carry no analysis fields and are never counted.
 */
export async function runCheck(request: CheckRequest, deps: CheckDeps): Promise<CheckOutcome> {
  const limits = deps.limits ?? DEFAULT_LIMITS;

  // 1) Server-side input validation (FR-M4-01): browser validation being bypassed is still
  //    rejected here. Over-cap input is rejected with an edit/reduce instruction and is
  //    never silently truncated (FS-M4-02).
  const text = request.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return rejected('invalid-input', EMPTY_INPUT_MESSAGE);
  }
  if (text.length > limits.inputCharCap) {
    return rejected(
      'invalid-input',
      `The message is longer than the ${limits.inputCharCap.toLocaleString('en-US')}-character limit. Edit or reduce it, then check again.`,
    );
  }

  // 2) Access (FS-M4-09/NFR-M4-02): only the server-side entitlement snapshot decides.
  const snapshot = deps.entitlement.getEntitlement(deps.session);
  const access = resolveAccess(snapshot, deps.clock.now());
  if (!access.allowed) {
    return rejected('access-blocked', ACCESS_BLOCKED_MESSAGE);
  }

  // 3) Usage gates (FS-M4-08): any denial declines the provider call entirely.
  const now = deps.clock.now();
  const denial = deps.usage.admitCheck({ key: snapshot.subjectKey, allowance: access.allowance }, now);
  if (denial !== null) {
    return rejected(denial.reason === 'rate-burst' ? 'rate-denied' : 'quota-denied', denial.message);
  }

  // 4) Stages 1–2 always run on an accepted check: pure local analysis, no network.
  const candidates = deps.extract(text);
  const rules = deps.analyzeRules(text);

  // 5) Provider (FS-M4-05): an unpermitted budget or a missing key disables the live call —
  //    the user receives an explicitly labelled rules-only limited result instead.
  if (!deps.budget.isProviderCallPermitted().permitted) {
    return analysed('limited', 'rules_only', 'unknown_other', candidates, rules, null, [RULES_ONLY_LIMITATION]);
  }
  const attempt = await deps.provider.analyze(text);
  if (attempt.kind === 'unconfigured') {
    return analysed('limited', 'rules_only', 'unknown_other', candidates, rules, null, [RULES_ONLY_LIMITATION]);
  }
  // 6) One attempt only (owner decision 19 Oct 2026): no retry, no fallback model —
  //    failure, timeout or invalid output ends in the honest unavailable state.
  if (attempt.kind === 'failed') {
    return analysed('unavailable', 'none', 'unknown_other', candidates, rules, null, [UNAVAILABLE_LIMITATION]);
  }
  const reply = validateReply(attempt.json);
  if (reply === null) {
    return analysed('unavailable', 'none', 'unknown_other', candidates, rules, null, [UNAVAILABLE_LIMITATION]);
  }

  // 7) Only a completed analysis counts (NFR-M4-10); nothing above consumed quota.
  deps.usage.recordCompletion({ key: snapshot.subjectKey }, deps.clock.now());
  return analysed('completed', 'rules_and_ai', reply.category, candidates, rules, reply, []);
}
