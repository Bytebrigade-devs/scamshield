import { feedback } from '../feedback-support';
import { getSubscriptionContext } from '@/lib/subscription-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Same-origin guard: a cross-site page must not be able to post a report. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/**
 * `/api/feedback` — validates the echoed `{ checkId, reasonCode }` report against the bounded
 * in-memory map and the owner-approved reason codes before storing. The browser can never
 * supply a check id it was not given, a free-text reason, or any message content.
 */
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

  // A signed-in caller's own subject is what the durable store needs; without a token the
  // in-memory demo path applies (it derives the subject from the id it issued).
  let subjectKey: string | undefined;
  if (request.headers.get('authorization') !== null) {
    try {
      const decision = await getSubscriptionContext(request);
      if (decision.kind === 'verified' && typeof decision.user?.id === 'string') subjectKey = decision.user.id;
    } catch {
      subjectKey = undefined; // an unverifiable session never authorizes a durable write
    }
  }

  const result = await feedback.report(body, subjectKey);
  return json(result.status, result.body);
}
