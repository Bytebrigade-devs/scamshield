/**
 * M4 — PostgREST transport for the durable adapter (server-only seam).
 *
 * Purpose: the live durable store talks to Supabase over PostgREST with `fetch` only — the
 * owner-side plan of 23 November 2026 forbids new runtime dependencies, so there is no SDK.
 * This module is the *only* place that knows about HTTP, headers and status codes; everything
 * above it works with a `PostgrestTransport`, which tests replace with a double. Nothing here
 * opens a socket until a caller passes a real `fetch`.
 *
 * HONESTY BOUNDARY: no Supabase project, table or function is contacted by this module on
 * import. The service-role key is never logged, never echoed in an error message, and is
 * redacted defensively if a response body happens to contain it.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */

/** HTTP methods the adapter needs. PostgREST RPC is always POST. */
export type PostgrestMethod = 'GET' | 'POST' | 'DELETE';

/**
 * One request, described independently of HTTP so a test double can serve it.
 *
 * `path` is a single segment either for a table (`/scam_checks`) or an RPC (`/rpc/m4_save_check`).
 * `query` values use PostgREST syntax already (`eq.`, `gt.`, `select=…`, `order=…`) — building
 * them is the adapter's job, not the transport's.
 */
export interface PostgrestRequest {
  method: PostgrestMethod;
  path: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  /** `Prefer` header values, e.g. `return=representation` or `resolution=merge-duplicates`. */
  prefer?: readonly string[];
}

export interface PostgrestResponse {
  status: number;
  body: unknown;
}

/** The injectable seam. A live implementation wraps `fetch`; tests pass a double. */
export interface PostgrestTransport {
  request(request: PostgrestRequest): Promise<PostgrestResponse>;
}

export interface PostgrestEndpoint {
  /** Project base URL, e.g. `https://<ref>.supabase.co` (no `/rest/v1`). */
  url: string;
  /** Service-role key. Server-only, never persisted by this module. */
  serviceRoleKey: string;
}

export type KeyRole = 'service_role' | 'anon' | 'unknown';

/** Thrown for any non-2xx response; carries the code PostgREST or Postgres returned. */
export class PostgrestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'PostgrestError';
    this.status = status;
    this.code = code;
  }
}

/** Invalid endpoint/key configuration. Raised before any request is attempted. */
export class PostgrestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostgrestConfigError';
  }
}

const JWT_SEGMENTS = 3;

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64').toString('utf8');
}

/**
 * Classify a Supabase key without trusting its name. Legacy keys are JWTs whose payload carries
 * `role`; newer secret keys use the `sb_secret_` prefix. Anything else is `unknown` and is
 * refused — an adapter that cannot prove it holds the service role must not run.
 */
export function keyRole(key: string): KeyRole {
  const trimmed = (key ?? '').trim();
  if (trimmed.length === 0) return 'unknown';
  if (trimmed.startsWith('sb_secret_')) return 'service_role';
  if (trimmed.startsWith('sb_publishable_')) return 'anon';

  const segments = trimmed.split('.');
  if (segments.length !== JWT_SEGMENTS) return 'unknown';
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(segments[1]!));
    if (typeof payload !== 'object' || payload === null) return 'unknown';
    const role = (payload as Record<string, unknown>).role;
    if (role === 'service_role') return 'service_role';
    if (role === 'anon' || role === 'authenticated') return 'anon';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Fail closed unless the supplied key *is* the service role. The live adapter must never be
 * constructed with the anon key: RLS would silently hide writes instead of failing loudly.
 */
export function assertServiceRoleKey(key: string): void {
  const role = keyRole(key);
  if (role === 'service_role') return;
  throw new PostgrestConfigError(
    role === 'anon'
      ? 'Refusing to build the durable transport with a public/anon key: the durable store requires the server-only service role.'
      : 'Refusing to build the durable transport: the key is not a recognisable service-role key.',
  );
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

function buildUrl(base: string, request: PostgrestRequest): string {
  const root = base.replace(/\/+$/, '');
  const path = request.path.startsWith('/') ? request.path : `/${request.path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) {
    params.set(key, value);
  }
  const query = params.toString();
  return `${root}${path}${query ? `?${query}` : ''}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFromBody(body: unknown, status: number, secret: string): PostgrestError {
  const record = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const rawMessage = typeof record.message === 'string' && record.message.length > 0
    ? record.message
    : `PostgREST request failed with status ${status}`;
  const code = typeof record.code === 'string' ? record.code : null;
  return new PostgrestError(redact(rawMessage, secret), status, code);
}

/**
 * Live transport: real `fetch`, real headers, real status handling.
 *
 * Configuration is validated up front — an `http://` URL is refused except for localhost, so a
 * service-role key cannot be put on the wire in clear text by accident.
 */
export function createFetchTransport(
  endpoint: PostgrestEndpoint,
  fetchImpl: typeof fetch = globalThis.fetch,
): PostgrestTransport {
  const rawUrl = (endpoint?.url ?? '').trim();
  if (rawUrl.length === 0) throw new PostgrestConfigError('A Supabase project URL is required.');
  assertServiceRoleKey(endpoint.serviceRoleKey);
  if (typeof fetchImpl !== 'function') {
    throw new PostgrestConfigError('No fetch implementation is available in this runtime.');
  }

  const url = new URL(rawUrl);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new PostgrestConfigError('The durable transport requires https (localhost excepted).');
  }

  const base = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}/rest/v1`;
  const secret = endpoint.serviceRoleKey.trim();

  return {
    async request(request) {
      const headers: Record<string, string> = {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      };
      if (request.body !== undefined) headers['Content-Type'] = 'application/json';
      if (request.prefer && request.prefer.length > 0) headers.Prefer = request.prefer.join(',');

      const response = await fetchImpl(buildUrl(base, request), {
        method: request.method,
        headers,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });

      const body = await readBody(response);
      if (!response.ok) {
        throw errorFromBody(body, response.status, secret);
      }
      // A JSON **string** body is a legitimate scalar result — `m4_save_check` returns the
      // check id as text — so it must be preserved, not discarded. (It was discarded until a
      // live test caught `checks.save` always returning null against the real API.)
      return { status: response.status, body };
    },
  };
}
