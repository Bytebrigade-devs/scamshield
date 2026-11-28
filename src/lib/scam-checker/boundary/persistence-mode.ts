/**
 * M4 — persistence selection: the one place that decides which store a server process uses.
 *
 * Two implementations satisfy the async `DurablePersistence` contract:
 *   - **memory** — `createAsyncPersistence(createInMemoryPersistence())`: the deterministic
 *     demo/test store that has carried the module so far;
 *   - **durable** — `createDurableAdapter(…PostgREST…)`: the live adapter built in Phase 5.
 *
 * This module makes the choice explicit and **fails closed**. A process that asked for durable
 * storage but cannot prove it has one must not quietly continue on an in-memory store: that
 * would look like persistence in the UI while losing every row on restart.
 *
 * WHAT CHANGED ON 24 NOVEMBER 2026 — and why this comment used to say the opposite:
 *   Migration `0003` is applied and verified, the adapter accepts `0.2.0-draft`, and the check
 *   service now consumes this selection for the event path, the check + history write and
 *   feedback. Selecting `durable` therefore feeds a store the service really uses. The demo
 *   subject (a plain string) still persists events only — `scam_checks.user_id` is a uuid, so
 *   checks, history and feedback require a verified authenticated caller by construction.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 convention.
 */
import { createAsyncPersistence, type DurablePersistence } from './durable-persistence.ts';
import { createInMemoryPersistence } from './persistence-port.ts';
import { createDurableAdapter } from './durable-adapter.ts';
import { createFetchTransport, type PostgrestTransport } from './postgrest-client.ts';

/** Environment variables this module reads. Names only — values are never logged. */
export const PERSISTENCE_ENV = Object.freeze({
  /** `1` / `true` selects the durable store; unset, `0` or `false` selects memory. */
  enabled: 'M4_DURABLE_STORE',
  /** Supabase project base URL, e.g. `https://<ref>.supabase.co`. */
  url: 'M4_SUPABASE_URL',
  /** Server-only service-role key. Never a public/anon key, never a `NEXT_PUBLIC_*` var. */
  serviceRoleKey: 'M4_SUPABASE_SERVICE_ROLE_KEY',
});

export type PersistenceMode = 'memory' | 'durable';

export interface PersistenceSelection {
  mode: PersistenceMode;
  persistence: DurablePersistence;
}

export interface PersistenceSelectionOptions {
  /** Clock used only by `deleteSubject`; injectable so tests stay deterministic. */
  now?: () => number;
  /** Replaces the live transport entirely — tests use this instead of a fake `fetch`. */
  transport?: PostgrestTransport;
  /** Replaces `fetch` inside the live transport. */
  fetchImpl?: typeof fetch;
}

const ENABLED = ['1', 'true'];
const DISABLED = ['0', 'false'];

function read(env: Record<string, string | undefined>, name: string): string {
  return (env[name] ?? '').trim();
}

/**
 * Choose a store from an environment record.
 *
 * Throws rather than degrades. Every error names the variable at fault and never its value.
 */
export function selectPersistence(
  env: Record<string, string | undefined> = {},
  options: PersistenceSelectionOptions = {},
): PersistenceSelection {
  const flag = read(env, PERSISTENCE_ENV.enabled).toLowerCase();

  if (flag === '' || DISABLED.includes(flag)) {
    return {
      mode: 'memory',
      persistence: createAsyncPersistence(createInMemoryPersistence()),
    };
  }

  if (!ENABLED.includes(flag)) {
    throw new Error(
      `Refusing to choose a store: ${PERSISTENCE_ENV.enabled}="${flag}" is not recognised. `
      + 'Use 1/true for the durable store, or 0/false (or leave it unset) for the in-memory store.',
    );
  }

  const url = read(env, PERSISTENCE_ENV.url);
  const serviceRoleKey = read(env, PERSISTENCE_ENV.serviceRoleKey);
  const missing: string[] = [];
  if (url.length === 0) missing.push(PERSISTENCE_ENV.url);
  if (serviceRoleKey.length === 0) missing.push(PERSISTENCE_ENV.serviceRoleKey);
  if (missing.length > 0) {
    throw new Error(
      `${PERSISTENCE_ENV.enabled} asked for the durable store, but ${missing.join(' and ')} `
      + 'is not set. Refusing to fall back to the in-memory store: rows would be lost on restart.',
    );
  }

  const transport = options.transport
    ?? createFetchTransport({ url, serviceRoleKey }, options.fetchImpl);
  return {
    mode: 'durable',
    persistence: createDurableAdapter(transport, options.now === undefined ? {} : { now: options.now }),
  };
}

/**
 * Non-throwing description for a startup log or a diagnostics surface: reports the mode only,
 * never the URL or the key. A `durable` process that failed to configure never reaches here —
 * `selectPersistence` throws first.
 */
export function describePersistence(selection: PersistenceSelection): string {
  return selection.mode === 'durable'
    ? 'durable store selected (PostgREST, service role)'
    : 'in-memory store selected (demo/test; nothing persisted)';
}
