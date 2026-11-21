/**
 * M4 — one checker service per server process, shared by the mounted routes.
 *
 * `/api/check` writes the usage counters and `/api/usage` reads them, so both must reach the
 * SAME store. Creating a service per route module would give each route its own empty store and
 * the read-back would always report zero. This module is the single construction point.
 *
 * HONEST LIMITATION (unchanged from `usage-store.ts`): the store is in-memory per process. A
 * restart forgets the counters and separate instances do not share them. The durable replacement
 * is M4's drafted Supabase schema, which is NOT applied and has no adapter yet.
 */
import { createCheckService, type CheckService } from './check-service.ts';

let instance: CheckService | null = null;

/** Construct on first import/use; later calls return the same instance. */
export function routeCheckService(): CheckService {
  instance ??= createCheckService({ live: null });
  return instance;
}