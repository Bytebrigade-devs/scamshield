/**
 * M4 checker — browser transport.
 *
 * Faithful to the contract the mounted routes already serve (and to what the vanilla screen
 * did): a single attempt per call, no client timeout, no retry, no credentials. Provider
 * selection, quota and credentials stay server-side; the browser sends only what the route
 * accepts. Error bodies are deliberately not surfaced — the user gets one honest sentence and
 * their text is never lost.
 */

import type { CheckPayload, CheckerConfig } from "./model";

export type ConfigResult = { ok: true; config: CheckerConfig } | { ok: false };

export type CheckResult = { ok: true; payload: CheckPayload } | { ok: false };

export type FeedbackResult = { ok: true } | { ok: false };

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
      headers: { "content-type": "application/json" },
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkId, reasonCode }),
    });
    return response.ok ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}
