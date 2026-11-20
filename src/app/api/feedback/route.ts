import { feedback } from '../feedback-support';

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

  const result = feedback.report(body);
  return json(result.status, result.body);
}
