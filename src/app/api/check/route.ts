import { DEFAULT_LIMITS } from '@/lib/scam-checker/boundary/check-boundary';
import { TAXONOMY_VERSION } from '@/lib/scam-checker/boundary/taxonomy';
import { routeCheckService } from '@/lib/scam-checker/ui/route-service';
import { getSubscriptionContext } from '@/lib/subscription-server';
import { gateRequestAccess } from '@/lib/scam-checker/boundary/request-entitlement';
import { feedback } from '../feedback-support';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `/api/check` — mirrors the workspace server's contract, including its honest failure bodies.
 *
 * The service is constructed with **no provider**: local pattern checks only. Provider
 * selection, usage authority and credentials stay server-side; the request may carry only the
 * message text and an optional sender string. The service (and therefore its usage store) is
 * shared with `/api/usage` through `route-service.ts`.
 */
const service = routeCheckService();

const NO_STORE = { 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Same-origin guard: a cross-site page must not be able to spend this route's quota. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
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
    // Entitlement (owner decision D3, 20 Nov 2026): requests without an Authorization header
    // (every browser request today, until M2 wires the session into the page) run under the
    // labelled demo subject. A caller claiming identity gets real enforcement and is never
    // silently downgraded to demo; their resolved subject also keys the feedback report.
    const hasAuthorization = request.headers.get('authorization') !== null;
    let subjectKey: string | undefined;
    if (hasAuthorization) {
      let decision: Awaited<ReturnType<typeof getSubscriptionContext>> | null = null;
      try {
        decision = await getSubscriptionContext(request);
      } catch {
        decision = null; // unreachable decision never authorizes a check
      }
      const gate = gateRequestAccess(decision, true, Date.now());
      if (gate.kind === 'rejected') return json(gate.status, { error: gate.error });
      if (gate.kind === 'allowed') subjectKey = gate.subjectKey;
    }
    const result = await service.check(record.text, record.sender);
    // "Report a wrong result": the server generates an opaque check id and lists the agreed
    // reason codes; the browser may only echo them back (owner decision, 18 November 2026).
    const feedbackOption = feedback.forOutcome(result.outcome, subjectKey);
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
}
