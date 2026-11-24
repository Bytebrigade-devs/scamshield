import { DEFAULT_LIMITS } from '@/lib/scam-checker/boundary/check-boundary';
import { TAXONOMY_VERSION } from '@/lib/scam-checker/boundary/taxonomy';
import { createCheckService, liveConfigFromEnv } from '@/lib/scam-checker/ui/check-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The config service reads the same server-side provider environment as `/api/check`
 * (`liveConfigFromEnv`), so `liveConfigured`/`model`/`api` honestly reflect whether a provider is
 * configured. With no `OPENAI_API_KEY` it reports rules-only. This route never calls the provider
 * and never returns the key — booleans and limits only.
 */
const service = createCheckService({ live: liveConfigFromEnv() });

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
