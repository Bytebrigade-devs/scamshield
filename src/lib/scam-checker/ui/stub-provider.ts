/**
 * M4 UI prototype — deterministic simulated provider.
 *
 * This is NOT a model and NOT an analysis. It exists so the UI can exercise all three
 * honest X-13 result states through the REAL check boundary without a live provider call
 * (X-09 remains open; this workspace holds no key). Every reply it returns is labelled as
 * simulated by the caller and must never be presented as AI analysis.
 *
 * Outcomes:
 *   completed   → a structurally valid DRAFT reply (validated by the boundary itself)
 *   unconfigured→ the boundary's labelled rules-only limited result (FS-M4-05)
 *   failure     → the boundary's honest unavailable state (FS-M4-06)
 *
 * The keyword mapping below is a transparent fixture helper, not detector logic: it selects
 * an X-13 display category for UI rendering and claims nothing about the message.
 */
import { TAXONOMY_VERSION } from '../boundary/check-boundary.ts';
import type { ProviderAttempt, ProviderPort } from '../boundary/check-boundary.ts';

export type StubOutcome = 'completed' | 'unconfigured' | 'failure';
export type StubFailure = 'timeout' | 'network' | 'http-error' | 'bad-json';

export interface StubProviderOptions {
  outcome: StubOutcome;
  /** Only used when outcome === 'failure'. */
  failure?: StubFailure;
}

/** Shown wherever a simulated reply is rendered. */
export const SIMULATED_REPLY_NOTE =
  'Simulated provider reply used for UI testing — not a real AI analysis.';

/**
 * Pick an X-13 display category from obvious fixture wording so the UI has something
 * meaningful to render. Transparent, deterministic, and explicitly not a detection claim.
 */
function simulatedCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/(password|one-time|otp|verify your|suspended|login)/.test(lower)) return 'phishing';
  if (/(prize|winner|lottery|reward|jackpot)/.test(lower)) return 'prize_lottery_scam';
  if (/(invoice|outstanding bill|payment due|overdue)/.test(lower)) return 'fake_invoice';
  if (/(love|marry|romance|darling|soulmate)/.test(lower)) return 'romance_scam';
  return 'unknown_other';
}

/** A structurally valid DRAFT reply (OD-M4-04 open): shape only, no truth claim. */
export function simulatedReply(text: string): Record<string, unknown> {
  return {
    verdict: 'Potentially suspicious (simulated)',
    category: simulatedCategory(text),
    taxonomy_version: TAXONOMY_VERSION,
    reason: SIMULATED_REPLY_NOTE,
  };
}

/** Create a deterministic ProviderPort for UI development. Performs no I/O. */
export function createStubProvider(options: StubProviderOptions): ProviderPort {
  return {
    async analyze(text: string): Promise<ProviderAttempt> {
      switch (options.outcome) {
        case 'unconfigured':
          return { kind: 'unconfigured' };
        case 'failure':
          return { kind: 'failed', failure: options.failure ?? 'http-error' };
        case 'completed':
        default:
          return { kind: 'ok', json: simulatedReply(text) };
      }
    },
  };
}
