/**
 * M2 → M4 entitlement adapter (15 November 2026).
 *
 * Maps M2's documented `getSubscriptionContext(request)` result into M4's own entitlement
 * port/snapshot. Confirmed against M2's second handoff (same day): the result uses `kind`
 * (`verified` / `unauthenticated` / `unavailable`), the verified user id lives at `user.id`,
 * and the plan decision is nested under `entitlement` (`canRunCheck`, `reason`, `planId`,
 * `status`, ISO `expiresAt`, `limits`). A flat fallback is tolerated for older fixtures.
 *
 * No network I/O: the caller supplies the already-fetched decision (the shared app passes M2's
 * helper; tests pass fixtures). This module does not read env vars, Supabase or credentials.
 *
 * M4 facts take precedence over M2 wording:
 * - Status vocabulary: `active | trial | cancelled | suspended | past_due`; `trialing` → `trial`.
 * - Expiry is epoch milliseconds internally; M2's ISO string is parsed and the decision is
 *   blocked when it is null, invalid or elapsed (at the exact instant, denied).
 * - `canRunCheck === false` is a denial (e.g. `subscription_required`, including the verified
 *   user with no subscription) and is applied before M4's quota/budget rules.
 * - M4 owns usage/allowance enforcement: M2 supplies limits but does not decrement counters;
 *   `limits` is accepted and not trusted as a quota source (no double counting).
 * - Malformed/unverifiable payloads or resolver errors → unavailable (503), never an allow.
 */
import { resolveAccess, type EntitlementSnapshot, type EntitlementStatus } from './check-boundary.ts';

/** The nested plan decision M2 returns on a verified result. */
export interface M2EntitlementDecision {
  canRunCheck?: unknown;
  reason?: unknown;
  planId?: unknown;
  status?: unknown;
  expiresAt?: unknown;
  limits?: unknown;
}

/** The M2 helper result as confirmed by M2 (every field treated as untrusted input). */
export interface M2SubscriptionDecision {
  /** `verified` | `unauthenticated` | `unavailable` (confirmed field name). */
  kind?: unknown;
  /** Older/alternate wording; ignored when `kind` is present. */
  result?: unknown;
  user?: { id?: unknown } | null;
  userId?: unknown;
  subjectKey?: unknown;
  entitlement?: M2EntitlementDecision | null;
  /** Flat fallbacks for older fixtures. */
  canRunCheck?: unknown;
  reason?: unknown;
  planId?: unknown;
  status?: unknown;
  expiresAt?: unknown;
  limits?: unknown;
}

export type M2OutcomeKind = 'unauthenticated' | 'unavailable' | 'denied' | 'allowed';

export interface M2AdapterOutcome {
  kind: M2OutcomeKind;
  /** Present only when the payload mapped to a snapshot (allowed, or denied by M2's gate). */
  snapshot: EntitlementSnapshot | null;
  /** Human-readable reason; never contains message text, keys or account identifiers. */
  reason: string;
}

const STATUS_MAP: Readonly<Record<string, EntitlementStatus>> = Object.freeze({
  active: 'active',
  trial: 'trial',
  trialing: 'trial',
  cancelled: 'cancelled',
  suspended: 'suspended',
  past_due: 'past_due',
});

/** Map M2 status wording to M4's vocabulary; unknown values return null (fail closed). */
export function mapM2Status(value: unknown): EntitlementStatus | null {
  if (typeof value !== 'string') return null;
  return STATUS_MAP[value.trim().toLowerCase()] ?? null;
}

/** Epoch-ms expiry from an ISO-8601 string (M2's format) or a number; null when unverifiable. */
export function parseM2Expiry(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function entitlementOf(decision: M2SubscriptionDecision): M2EntitlementDecision {
  return decision.entitlement ?? decision;
}

function subjectOf(decision: M2SubscriptionDecision): string | null {
  for (const candidate of [decision.user?.id, decision.userId, decision.subjectKey]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

function kindOf(decision: M2SubscriptionDecision): string | null {
  const value = decision.kind ?? decision.result;
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

/**
 * Map an M2 decision to M4's entitlement snapshot. Returns null for anything M4 cannot verify;
 * a `canRunCheck === false` decision is still a **denial**, not "unavailable" — see resolveM2Outcome.
 */
export function toEntitlementSnapshot(decision: M2SubscriptionDecision | null | undefined): EntitlementSnapshot | null {
  if (!decision || typeof decision !== 'object') return null;
  if (kindOf(decision) !== 'verified') return null;
  const entitlement = entitlementOf(decision);
  const subjectKey = subjectOf(decision);
  const status = mapM2Status(entitlement.status);
  const expiresAt = parseM2Expiry(entitlement.expiresAt);
  if (subjectKey === null || status === null || expiresAt === null) return null;
  const planIdValue = typeof entitlement.planId === 'string' ? entitlement.planId.trim().toLowerCase() : '';
  // A trial always maps even when the plan id is absent; M4's resolveAccess uses the trial allowance.
  const planId = planIdValue.length > 0 ? planIdValue : status === 'trial' ? 'trial' : '';
  if (planId.length === 0) return null;
  return { subjectKey, planId, status, expiresAt };
}

/** Translate one M2 decision into M4's route-level outcome (401 / 503 / denied / allowed). */
export function resolveM2Outcome(decision: M2SubscriptionDecision | null | undefined, now: number): M2AdapterOutcome {
  const kind = decision && typeof decision === 'object' ? kindOf(decision) : null;
  if (kind === 'unauthenticated') return { kind: 'unauthenticated', snapshot: null, reason: 'Sign in required.' };
  if (kind !== 'verified') {
    // Includes `unavailable`, malformed payloads and missing results: stop before the checker/provider.
    return { kind: 'unavailable', snapshot: null, reason: 'Access check temporarily unavailable.' };
  }
  const entitlement = entitlementOf(decision!);
  const snapshot = toEntitlementSnapshot(decision);
  if (entitlement.canRunCheck === false) {
    // M2's gate: subscription_required (including a verified user with no subscription).
    return { kind: 'denied', snapshot, reason: 'An active subscription or trial is required.' };
  }
  if (snapshot === null) {
    return { kind: 'unavailable', snapshot: null, reason: 'Access decision could not be verified.' };
  }
  const access = resolveAccess(snapshot, now);
  if (!access.allowed) {
    return { kind: 'denied', snapshot, reason: 'No active entitlement allows a check.' };
  }
  return { kind: 'allowed', snapshot, reason: 'Entitlement verified.' };
}

/**
 * Build M4's EntitlementPort from an injected decision resolver (the shared app passes M2's
 * `getSubscriptionContext`; tests pass a fixture). No I/O happens here.
 */
export function createM2EntitlementPort(
  resolveDecision: (session: unknown) => M2SubscriptionDecision | null | undefined,
  now: () => number = Date.now,
): { getEntitlement(session: unknown): EntitlementSnapshot | null } {
  return {
    getEntitlement(session: unknown): EntitlementSnapshot | null {
      let decision: M2SubscriptionDecision | null | undefined;
      try {
        decision = resolveDecision(session);
      } catch {
        return null; // unreachable decision never authorizes a paid call
      }
      const outcome = resolveM2Outcome(decision, now());
      return outcome.kind === 'allowed' ? outcome.snapshot : null;
    },
  };
}
