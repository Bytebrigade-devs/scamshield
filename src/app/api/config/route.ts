import { DEFAULT_LIMITS } from '@/lib/scam-checker/boundary/check-boundary';
import { TAXONOMY_VERSION } from '@/lib/scam-checker/boundary/taxonomy';
import { createCheckService } from '@/lib/scam-checker/ui/check-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The demo service is built with **no provider** on purpose: the mounted checker runs local
 * pattern checks only, so a public route can never spend money or call an external model.
 * Live AI stays gated behind the X-09 closure and a deliberate server-side configuration.
 */
const service = createCheckService({ live: null });

/** `/api/config` — booleans and limits only. Never the key, never provider internals. */
export function GET(): Response {
  return Response.json(
    {
      liveConfigured: service.liveConfigured,
      model: service.model,
      api: service.api,
      limits: {
        inputCharCap: DEFAULT_LIMITS.inputCharCap,
        burstMax: DEFAULT_LIMITS.burstMax,
        burstWindowMs: DEFAULT_LIMITS.burstWindowMs,
      },
      taxonomyVersion: TAXONOMY_VERSION,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
