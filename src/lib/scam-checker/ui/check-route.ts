/**
 * Framework-neutral `/api/check` handler.
 *
 * The Next.js route is a five-line wrapper around this function, which exists so the transport
 * behaviour is testable under plain `node --test` — no bundler, no path aliases, no Supabase — and
 * so there is exactly one implementation of the admission rules.
 *
 * Admission (owner decision D3, 20 Nov 2026): a request with no `Authorization` header runs under
 * the labelled demo subject — that is the public rules-only demo. A caller who *claims* an identity
 * gets real enforcement and is never silently downgraded to the demo path. A refusal never reaches
 * the provider. Nothing here reads the environment, holds a key, or knows about a host.
 */

import { DEFAULT_LIMITS, TAXONOMY_VERSION } from '../boundary/check-boundary.ts';
import { toEntitlementSnapshot, type M2SubscriptionDecision } from '../boundary/m2-entitlement-adapter.ts';
import { gateRequestAccess } from '../boundary/request-entitlement.ts';
import type { CheckService } from './check-service.ts';
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

export function createCheckRoute(options: CheckRouteOptions): (request: Request) => Promise<Response> {
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
      // gets real enforcement; their resolved subject also keys the feedback report.
      const hasAuthorization = request.headers.get('authorization') !== null;
      let subjectKey: string | undefined;
      /** Passed to the service so a completed analysis can be persisted under a verified user. */
      let context: { subjectKey: string; planId: string; entitlementExpiresAt: number } | undefined;

      if (hasAuthorization) {
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
          const snapshot =
            decision !== null && decision.kind === 'verified' ? toEntitlementSnapshot(decision.entitlement) : null;
          if (snapshot !== null) {
            context = {
              subjectKey: gate.subjectKey,
              planId: snapshot.planId,
              entitlementExpiresAt: snapshot.expiresAt,
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
