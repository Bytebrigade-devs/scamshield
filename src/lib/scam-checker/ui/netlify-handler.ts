/** Web-standard adapter for the temporary hosted demo; credentials stay server-side. */
import { DEFAULT_LIMITS, TAXONOMY_VERSION } from '../boundary/check-boundary.ts';
import { createCheckService, liveConfigFromEnv } from './check-service.ts';
import type { CheckService } from './check-service.ts';

const MAX_BODY_BYTES = 64 * 1024;

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  });
}

export function createNetlifyHandler(service: CheckService) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const metadata = { limits: DEFAULT_LIMITS, taxonomyVersion: TAXONOMY_VERSION };
      if (url.pathname === '/api/config') {
        if (request.method !== 'GET') return json(405, { error: 'method-not-allowed' });
        return json(200, {
          liveConfigured: service.liveConfigured,
          model: service.model,
          api: service.api,
          ...metadata,
        });
      }
      if (url.pathname !== '/api/check') return json(404, { error: 'not-found' });
      if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
      const origin = request.headers.get('origin');
      if (origin !== null && origin !== url.origin) return json(403, { error: 'forbidden-origin' });
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return json(415, { error: 'unsupported-media-type' });
      }
      let body: unknown;
      try {
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) {
              await reader.cancel();
              return json(400, { error: 'bad-request' });
            }
            chunks.push(value);
          }
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        body = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        return json(400, { error: 'bad-request' });
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return json(400, { error: 'bad-request' });
      }
      const record = body as Record<string, unknown>;
      const result = await service.check(record.text, record.sender);
      return json(200, { ...result, ...metadata });
    } catch {
      return json(500, { error: 'internal-error' });
    }
  };
}

// Reuse the service within a warm instance. Its existing demo quotas are in memory,
// shared by visitors to that instance, and reset when Netlify replaces the instance.
let handler: ReturnType<typeof createNetlifyHandler> | undefined;
export default async function netlifyHandler(request: Request): Promise<Response> {
  handler ??= createNetlifyHandler(createCheckService({ live: liveConfigFromEnv() }));
  return handler(request);
}
