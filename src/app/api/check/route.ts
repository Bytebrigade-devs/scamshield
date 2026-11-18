import { DEFAULT_LIMITS } from '@/lib/scam-checker/boundary/check-boundary';
import { TAXONOMY_VERSION } from '@/lib/scam-checker/boundary/taxonomy';
import { createCheckService } from '@/lib/scam-checker/ui/check-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `/api/check` — mirrors the workspace server's contract, including its honest failure bodies.
 *
 * The service is constructed with **no provider**: local pattern checks only. Provider
 * selection, usage authority and credentials stay server-side; the request may carry only the
 * message text and an optional sender string.
 */
const service = createCheckService({ live: null });

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
    const result = await service.check(record.text, record.sender);
    return json(200, {
      ...result,
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
