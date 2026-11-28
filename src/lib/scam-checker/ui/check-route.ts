/**
 * Framework-neutral `/api/check` handler.
 *
 * The Next.js route is a five-line wrapper around this function, which exists so the transport
 * behaviour is testable under plain `node --test` — no bundler, no path aliases, no Supabase — and
 * so there is exactly one implementation of the admission rules.
 *
 * Admission (owner instruction, 28 November 2026): **a check requires a signed-in account.** A request
 * with no `Authorization` header is refused with `401 sign-in-required` before the provider, the quota or
 * any event, so an anonymous caller can never obtain a verdict. This reverses the labelled public demo
 * path that decision D3 introduced on 20 Nov 2026 — see `docs/m4-check-boundary.md`. A caller who claims
 * an identity gets real enforcement and is never silently downgraded. A refusal never reaches the
 * provider. Nothing here reads the environment, holds a key, or knows about a host.
 */

import { DEFAULT_LIMITS, TAXONOMY_VERSION } from '../boundary/check-boundary.ts';
import { toEntitlementSnapshot, type M2SubscriptionDecision } from '../boundary/m2-entitlement-adapter.ts';
import { gateRequestAccess } from '../boundary/request-entitlement.ts';
import type { CheckService, CheckSubjectContext } from './check-service.ts';
import type { FeedbackSupport } from './feedback-endpoint.ts';

export interface CheckRouteOptions {
  service: CheckService;
  feedback: FeedbackSupport;
  /** Resolves the caller's own M2 entitlement; only called when a header is present. */
  resolveContext: (request: Request) => Promise<M2SubscriptionDecision | null>;
  now?: () => number;
}

const NO_STORE = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** A cross-site page must not be able to spend this route's quota. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export function createCheckApiRoute(options: CheckRouteOptions): (request: Request) => Promise<Response> {
  const { service, feedback, resolveContext } = options;
  const now = options.now ?? Date.now;

  return async function handle(request: Request): Promise<Response> {
    if (!isSameOrigin(request)) return json(403, { error: 'forbidden-origin' });

    const mediaType = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') return json(415, { error: 'unsupported-media-type' });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'bad-request' });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json(400, { error: 'bad-request' });
    }

    const record = body as Record<string, unknown>;
    try {
      // Requests without a header run under the labelled demo subject. A caller claiming identity
      // Requests without a header are REFUSED (owner instruction, 28 Nov 2026). This reverses D3's
      // labelled public demo path: a check now requires a signed-in account. The refusal happens
      // before the provider call, the quota reservation and the event, so an anonymous caller can
      // never obtain a verdict or consume a unit.
      if (request.headers.get('authorization') === null) return json(401, { error: 'sign-in-required' });

      let subjectKey: string | undefined;
      /** Passed to the service so a completed analysis is persisted AND quota-gated for the caller. */
      let context: CheckSubjectContext | undefined;

      {
        let decision: M2SubscriptionDecision | null = null;
        try {
          decision = await resolveContext(request);
        } catch {
          decision = null; // unreachable decision never authorizes a check
        }
        const gate = gateRequestAccess(decision, true, now());
        if (gate.kind === 'rejected') return json(gate.status, { error: gate.error });
        if (gate.kind === 'allowed') {
          subjectKey = gate.subjectKey;
          // The snapshot supplies plan + expiry for the durable row; without it no row is written.
          // Pass the FULL decision: toEntitlementSnapshot reads kind/user/entitlement off it, so
          // handing it only decision.entitlement always returned null and silently dropped history.
          const snapshot =
            decision !== null && decision.kind === 'verified' ? toEntitlementSnapshot(decision) : null;
          if (snapshot !== null) {
            context = {
              subjectKey: gate.subjectKey,
              planId: snapshot.planId,
              entitlementExpiresAt: snapshot.expiresAt,
              // The quota gate uses the SAME verified snapshot the gate already accepted, so a
              // signed-in caller is counted against their own plan and subject (27 Nov 2026).
              entitlement: snapshot,
            };
          }
        }
      }

      const result = await service.check(record.text, record.sender, context);

      // "Report a wrong result": the server generates an opaque check id and lists the agreed
      // reason codes; the browser may only echo them back. A failed durable write omits the
      // control entirely (owner decision, 24 November 2026).
      const feedbackOption =
        result.persistenceFailure !== undefined
          ? null
          : feedback.forOutcome(result.outcome, subjectKey, result.persistedCheckId);

      return json(200, {
        ...result,
        ...(feedbackOption ? { feedback: feedbackOption } : {}),
        limits: {
          inputCharCap: DEFAULT_LIMITS.inputCharCap,
          burstMax: DEFAULT_LIMITS.burstMax,
          burstWindowMs: DEFAULT_LIMITS.burstWindowMs,
        },
        taxonomyVersion: TAXONOMY_VERSION,
      });
    } catch {
      // Never surface internals (or credentials) in an error response.
      return json(500, { error: 'internal-error' });
    }
  };
}
