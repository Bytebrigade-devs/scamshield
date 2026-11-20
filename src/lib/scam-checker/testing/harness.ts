/**
 * M4 testing harness — shared builders for boundary tests (M4-19 / X-06).
 *
 * Purpose: remove hand-rolled fixture duplication in new tests while keeping every fake
 * explicit and dependency-free. Nothing here performs I/O, reads env vars or opens a socket.
 *
 * Scope: NEW tests only. Existing tests are deliberately not migrated (avoid churn); the
 * conventions doc is testing/M4-TEST-CONVENTIONS.md.
 */
import type {
  BudgetPort, CheckDeps, CheckRequest, ClockPort, EntitlementPort, EntitlementSnapshot,
  ProviderAttempt, ProviderPort, StageCandidates, StageRules, UsagePort,
} from '../boundary/check-boundary.ts';
import { createInMemoryUsageStore } from '../boundary/usage-store.ts';

/** A fixed clock: every `now()` call returns the same epoch-ms value. */
export function fixedClock(nowMs: number): ClockPort {
  return { now: () => nowMs };
}

/** A one-shot or scripted provider: each analyze() call consumes the next attempt. */
export function makeProvider(attempts: ProviderAttempt | ProviderAttempt[]): ProviderPort {
  const queue = Array.isArray(attempts) ? [...attempts] : [attempts];
  return {
    async analyze(): Promise<ProviderAttempt> {
      return queue.length > 1 ? queue.shift()! : queue[0] ?? { kind: 'unconfigured' };
    },
  };
}

/** An entitlement port that always returns the given snapshot (or null). */
export function makeEntitlementPort(snapshot: EntitlementSnapshot | null): EntitlementPort {
  return { getEntitlement: () => snapshot };
}

/** A valid synthetic snapshot; override only the fields the test is about. */
export function makeEntitlement(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    subjectKey: 'subject-a',
    planId: 'guardian',
    status: 'active',
    expiresAt: Date.parse('2026-12-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** A usage port with deterministic in-memory behaviour. */
export function makeUsageStore(): UsagePort {
  return createInMemoryUsageStore();
}

/** A budget port that permits live calls by default (the boundary still needs a key). */
export function makeBudget(permitted = true): BudgetPort {
  return { isProviderCallPermitted: () => ({ permitted }) };
}

export interface CheckDepsOverrides {
  session?: unknown;
  snapshot?: EntitlementSnapshot | null;
  usage?: UsagePort;
  provider?: ProviderPort;
  budget?: BudgetPort;
  nowMs?: number;
  extract?: (text: string) => StageCandidates;
  analyzeRules?: (text: string) => StageRules;
}

/**
 * Build a complete CheckDeps for a boundary test. Defaults describe an entitled user with no
 * local matches and an unconfigured provider — i.e. the honest rules-only path.
 */
export function makeCheckDeps(overrides: CheckDepsOverrides = {}): CheckDeps {
  const nowMs = overrides.nowMs ?? Date.parse('2026-11-15T12:00:00.000Z');
  return {
    session: overrides.session ?? { token: 'synthetic-session' },
    extract: overrides.extract ?? (() => ({ urls: [], emails: [], phones: [], wrappedCandidates: [] })),
    analyzeRules: overrides.analyzeRules ?? (() => ({ matches: [] })),
    entitlement: makeEntitlementPort(overrides.snapshot === undefined ? makeEntitlement() : overrides.snapshot),
    usage: overrides.usage ?? makeUsageStore(),
    budget: overrides.budget ?? makeBudget(),
    provider: overrides.provider ?? makeProvider({ kind: 'unconfigured' }),
    clock: fixedClock(nowMs),
  };
}

/** A request containing only the one accepted field. */
export function makeCheckRequest(text: string): CheckRequest {
  return { text };
}
