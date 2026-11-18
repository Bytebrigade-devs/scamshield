/**
 * M4 scam-checker local HTTP server.
 *
 * Serves the user interface and two JSON endpoints. Nothing else is reachable.
 *
 * Security posture:
 *  - Credentials are read from server-side environment only and are never serialised,
 *    logged or echoed. `/api/config` returns booleans and a model id, never the key.
 *  - The check endpoint reads only `text` and optional unverified `sender` data.
 *    All browser-supplied provider, research and verification authority is inert.
 *  - Static serving is confined to ./public (path traversal rejected).
 *  - No request bodies, headers or credentials are logged.
 */
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_LIMITS, TAXONOMY_VERSION } from '../boundary/check-boundary.ts';
import { createCheckService, DEMO_SUBJECT_KEY, liveConfigFromEnv } from './check-service.ts';
import type { CheckService } from './check-service.ts';
import { createFeedbackSupport } from './feedback-endpoint.ts';
import type { FeedbackSupport } from './feedback-endpoint.ts';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const MAX_BODY_BYTES = 64 * 1024;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

const BASE_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

const HTML_CSP =
  "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export interface UiServerOptions {
  service: CheckService;
  publicDir?: string;
  /** Injected for tests; defaults to the in-memory demo feedback store. */
  feedback?: FeedbackSupport;
  /** Injected for tests; defaults to the real clock. */
  now?: () => number;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req);
  if (raw.trim().length === 0) return {};
  return JSON.parse(raw) as unknown;
}

/** Browser requests may only originate from this local server. API clients may omit Origin. */
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || typeof req.headers.host !== 'string') return false;
  try {
    const source = new URL(origin);
    const target = new URL(`http://${req.headers.host}`);
    // Origin is a serialized origin, not an arbitrary URL with a path or credentials.
    return source.origin === origin && source.origin === target.origin;
  } catch {
    return false;
  }
}

async function serveStatic(
  res: ServerResponse,
  pathname: string,
  publicDir: string,
  method: string,
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: 'bad-path' });
    return;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = resolve(publicDir, relative);
  const publicRoot = resolve(publicDir) + sep;
  if (!filePath.startsWith(publicRoot)) {
    sendJson(res, 404, { error: 'not-found' });
    return;
  }
  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch {
    sendJson(res, 404, { error: 'not-found' });
    return;
  }
  const extension = extname(filePath).toLowerCase();
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'content-length': String(content.length),
  };
  if (extension === '.html') headers['content-security-policy'] = HTML_CSP;
  res.writeHead(200, headers);
  // HEAD returns headers only, per HTTP semantics.
  res.end(method === 'HEAD' ? undefined : content);
}

/** Build the HTTP server around an injected service (tests use this directly). */
export function createUiServer(options: UiServerOptions): Server {
  const { service } = options;
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR;
  const feedback = options.feedback ?? createFeedbackSupport({ subjectKey: DEMO_SUBJECT_KEY });

  return createHttpServer(async (req, res) => {
    const method = req.method ?? 'GET';

    try {
      let pathname: string;
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      } catch {
        sendJson(res, 400, { error: 'bad-request' });
        return;
      }
      if (pathname === '/api/config') {
        if (method !== 'GET') {
          sendJson(res, 405, { error: 'method-not-allowed' });
          return;
        }
        sendJson(res, 200, {
          liveConfigured: service.liveConfigured,
          model: service.model,
          api: service.api,
          limits: {
            inputCharCap: DEFAULT_LIMITS.inputCharCap,
            burstMax: DEFAULT_LIMITS.burstMax,
            burstWindowMs: DEFAULT_LIMITS.burstWindowMs,
          },
          taxonomyVersion: TAXONOMY_VERSION,
        });
        return;
      }

      if (pathname === '/api/check') {
        if (method !== 'POST') {
          sendJson(res, 405, { error: 'method-not-allowed' });
          return;
        }
        if (!isAllowedOrigin(req)) {
          sendJson(res, 403, { error: 'forbidden-origin' });
          return;
        }
        const mediaType = req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
        if (mediaType !== 'application/json') {
          sendJson(res, 415, { error: 'unsupported-media-type' });
          return;
        }
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: 'bad-request' });
          return;
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          sendJson(res, 400, { error: 'bad-request' });
          return;
        }
        const record = body as Record<string, unknown>;
        // Provider selection and usage authority remain exclusively on the server.
        const text = record.text;
        const result = await service.check(text, record.sender);
        // "Report a wrong result": the server generates an opaque check id and lists the
        // agreed reason codes; the browser may only echo them back (owner decision, 18 Nov 2026).
        const feedbackOption = feedback.forOutcome(result.outcome);
        sendJson(res, 200, {
          ...result,
          ...(feedbackOption ? { feedback: feedbackOption } : {}),
          limits: {
            inputCharCap: DEFAULT_LIMITS.inputCharCap,
            burstMax: DEFAULT_LIMITS.burstMax,
            burstWindowMs: DEFAULT_LIMITS.burstWindowMs,
          },
          taxonomyVersion: TAXONOMY_VERSION,
        });
        return;
      }

      if (pathname === '/api/feedback') {
        if (method !== 'POST') {
          sendJson(res, 405, { error: 'method-not-allowed' });
          return;
        }
        if (!isAllowedOrigin(req)) {
          sendJson(res, 403, { error: 'forbidden-origin' });
          return;
        }
        const mediaType = req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
        if (mediaType !== 'application/json') {
          sendJson(res, 415, { error: 'unsupported-media-type' });
          return;
        }
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: 'bad-request' });
          return;
        }
        const outcome = feedback.report(body);
        sendJson(res, outcome.status, outcome.body);
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'not-found' });
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        await serveStatic(res, pathname, publicDir, method);
        return;
      }

      sendJson(res, 405, { error: 'method-not-allowed' });
    } catch {
      // Never surface internals (or credentials) in an error response.
      if (!res.headersSent) sendJson(res, 500, { error: 'internal-error' });
      else res.end();
    }
  });
}

function loadLocalEnv(): void {
  // Server-side test credentials live in code/ui/.env.local (gitignored). Process-level
  // environment variables take precedence; a missing file is normal.
  const envFile = fileURLToPath(new URL('./.env.local', import.meta.url));
  try {
    process.loadEnvFile(envFile);
  } catch {
    // No local env file — local rules only.
  }
}

function start(): void {
  loadLocalEnv();
  const live = liveConfigFromEnv();
  const service = createCheckService({ live });
  const port = Number.parseInt(process.env.M4_UI_PORT ?? '4173', 10);
  const server = createUiServer({ service });
  server.listen(Number.isFinite(port) ? port : 4173, '127.0.0.1', () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address !== null ? address.port : port;
    // No credentials or endpoints are printed.
    console.log(`ScamShield: http://127.0.0.1:${boundPort}`);
    console.log(`Analysis: ${live ? 'configured AI provider' : 'local rules only (no AI key configured)'}`);
    console.log('Synthetic messages only. X-09 remains open; this is not product use.');
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) start();
