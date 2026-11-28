/**
 * M4 boundary — bounded single-fallback provider (server-side only).
 *
 * Owner decision, 22 November 2026: `gpt-6-luna` is the primary model and `gpt-5.6-luna` may serve
 * as ONE fallback attempt. This replaces the 19 October 2026 "no automatic fallback" interim policy,
 * but keeps every bound that policy was protecting:
 *
 *  1. At most ONE additional attempt per check. Never a third, never a loop.
 *  2. Only on a transport-class failure — `timeout`, `network` or `http-error`. Those are the
 *     failures where a second attempt cannot change the substance of the answer, only availability.
 *  3. NEVER on `bad-json`. That outcome covers a truncated answer, an unparseable one, and a model
 *     refusal alike; retrying it on another model is exactly the "retry to obtain a more confident
 *     answer" the contract forbids, and it could turn an honest failure into a fluent guess.
 *  4. Never on `unconfigured` — there is no key, so the fallback has nothing to call.
 *  5. A failed fallback still ends in the boundary's labelled unavailable state. Nothing is
 *     invented, repaired or upgraded into a verdict.
 *
 * Wrapping is transparent to `check-boundary.ts`: the boundary still makes one `analyze()` call per
 * check and still decides the outcome. Spend note: a failed primary may still be billed, so the
 * worst case for one check is primary + fallback, not one cheap call.
 */
import type { ProviderAttempt, ProviderFailure, ProviderPort } from './check-boundary.ts';

/** The only failures a single fallback attempt may answer. `bad-json` is deliberately excluded. */
export const FALLBACK_ELIGIBLE_FAILURES = ['timeout', 'network', 'http-error'] as const;

export type FallbackEligibleFailure = typeof FALLBACK_ELIGIBLE_FAILURES[number];

export function isFallbackEligible(failure: ProviderFailure): failure is FallbackEligibleFailure {
  return (FALLBACK_ELIGIBLE_FAILURES as readonly string[]).includes(failure);
}

export interface FallbackProviderOptions {
  /** The primary model. Called first, always. */
  primary: ProviderPort;
  /** The single fallback model. Called at most once, and only for an eligible failure. */
  fallback: ProviderPort;
  /** Server-side diagnostic only — never the key, the message text or a verdict. */
  onFallback?: (info: { failure: FallbackEligibleFailure }) => void;
}

export function createFallbackProvider(options: FallbackProviderOptions): ProviderPort {
  return {
    async analyze(text: string): Promise<ProviderAttempt> {
      const primary = await options.primary.analyze(text);
      if (primary.kind !== 'failed') return primary; // ok, or unconfigured (no key at all)
      if (!isFallbackEligible(primary.failure)) return primary; // bad-json: no second guess

      options.onFallback?.({ failure: primary.failure });
      return options.fallback.analyze(text);
    },
  };
}
