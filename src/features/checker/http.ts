/**
 * M4 checker — browser transport.
 *
 * Faithful to the contract the mounted routes already serve (and to what the vanilla screen
 * did): a single attempt per call, no client timeout, no retry. Provider selection, quota and
 * credentials stay server-side; the browser sends only what the route accepts, plus — when a
 * session exists — its access token as an Authorization header so the server can attribute the
 * check and serve account history. Error bodies are deliberately not surfaced — the user gets one
 * honest sentence and their text is never lost.
 */

import type { CheckPayload, CheckerConfig } from "./model";
import { accessToken } from "./session";

export type ConfigResult = { ok: true; config: CheckerConfig } | { ok: false };

export type CheckResult = { ok: true; payload: CheckPayload } | { ok: false };

export type FeedbackResult = { ok: true } | { ok: false };

/** One server history row as served by `GET /api/history` (already retention-filtered). */
export interface ServerHistoryRow {
  createdAt: number;
  snippet: string;
  verdictLabel: string;
  category: string;
}

export type HistoryResult =
  | { ok: true; access: "full" | "read-only"; entries: ServerHistoryRow[] }
  | { ok: false };

/** Authorization header for a signed-in caller, or nothing when anonymous. */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** `GET /api/config` — booleans and limits only; never the key or provider internals. */
export async function loadConfig(signal?: AbortSignal): Promise<ConfigResult> {
  try {
    const response = await fetch("/api/config", { cache: "no-store", ...(signal ? { signal } : {}) });
    if (!response.ok) return { ok: false };
    const config: unknown = await response.json();
    if (!isUsableConfig(config)) return { ok: false };
    return { ok: true, config };
  } catch {
    return { ok: false };
  }
}

/** A config we can act on: a boolean switch and a positive integer cap. */
function isUsableConfig(value: unknown): value is CheckerConfig {
  if (value === null || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  if (typeof config.liveConfigured !== "boolean") return false;
  const limits = config.limits as Record<string, unknown> | undefined;
  const cap = limits?.inputCharCap;
  return typeof cap === "number" && Number.isInteger(cap) && cap > 0;
}

/** `POST /api/check` — the only call that carries the message, and only on submit. */
export async function postCheck(text: string, sender: string): Promise<CheckResult> {
  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ text, ...(sender ? { sender } : {}) }),
    });
    if (!response.ok) return { ok: false };
    const payload: unknown = await response.json();
    if (payload === null || typeof payload !== "object") return { ok: false };
    const body = payload as Record<string, unknown>;
    if (body.outcome === null || typeof body.outcome !== "object") return { ok: false };
    return { ok: true, payload: body as unknown as CheckPayload };
  } catch {
    return { ok: false };
  }
}

/**
 * `POST /api/feedback` — echoes back only the opaque check id and one allowed reason code.
 * No message text, no free text, no identity.
 */
export async function postFeedback(checkId: string, reasonCode: string): Promise<FeedbackResult> {
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ checkId, reasonCode }),
    });
    return response.ok ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * `GET /api/history` — the signed-in caller's own retained checks. Anonymous callers get no token
 * and the route fails closed (401), so this returns `{ ok: false }` and the provider keeps the
 * tab-session list. Server rows are read-only; the checker never deletes them.
 */
export async function loadHistory(signal?: AbortSignal): Promise<HistoryResult> {
  const headers = await authHeaders();
  if (!headers.authorization) return { ok: false };
  try {
    const response = await fetch("/api/history", {
      cache: "no-store",
      headers,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return { ok: false };
    const body: unknown = await response.json();
    if (body === null || typeof body !== "object") return { ok: false };
    const record = body as Record<string, unknown>;
    if (record.access !== "full" && record.access !== "read-only") return { ok: false };
    if (!Array.isArray(record.entries)) return { ok: false };
    return { ok: true, access: record.access, entries: record.entries as ServerHistoryRow[] };
  } catch {
    return { ok: false };
  }
}
