/**
 * M2 — auth mail delivery (server only): one sender choice for every authentication email.
 *
 * Precedence, deliberately simple:
 *   1. Resend, when `RESEND_API_KEY` and a sender (`AUTH_EMAIL_FROM`, else `TRIAL_EMAIL_FROM`) are
 *      configured. This is the sender the registration link and the reset code use when available.
 *   2. A development outbox, when `AUTH_MAIL_DRIVER=outbox` AND the build is not production: the
 *      message is written to `AUTH_MAIL_OUTBOX` (default `.dev-outbox`, gitignored) and printed in
 *      the server terminal. A production build never takes this branch, so a reset code or a
 *      confirmation link is never written to disk in production.
 *   3. Nothing: callers report "not configured" instead of pretending a message was sent.
 *
 * Failure reporting: Resend answers 401 (bad key), 403 (sender domain not verified), 422 (bad
 * address) and 429 (quota) very differently, and collapsing them into one "failed" — as this module
 * used to — is why a broken sender was undebuggable. The status and Resend's own reason are logged
 * server-side and returned to the caller so the route can tell the user to wait rather than to retry
 * a request that cannot succeed. No key, code, or link is ever logged.
 *
 * This module holds no secrets in responses and never logs message bodies; the outbox warning
 * prints the filename only, because in development that file is the intended way to read the code.
 */
import { mkdirSync, writeFileSync } from "node:fs";

export type MailChannel =
  | { kind: "resend"; apiKey: string; from: string }
  | { kind: "outbox"; dir: string };

export interface AuthMailMessage {
  to: string;
  subject: string;
  /** Plain-text part. Always sent; a client that refuses HTML must still get the link or code. */
  text: string;
  html?: string;
  /** Picks the outbox filename and the Resend tag. Never user-visible. */
  flow: "confirm" | "recovery";
  replyTo?: string;
}

export type MailResult =
  | { kind: "sent" }
  | { kind: "outbox"; file: string }
  | { kind: "failed"; status?: number; reason?: string; retryAfterSeconds?: number };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function mailChannel(): MailChannel | null {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.AUTH_EMAIL_FROM ?? process.env.TRIAL_EMAIL_FROM ?? "").trim();
  if (apiKey.length > 0 && from.length > 0) return { kind: "resend", apiKey, from };
  if (process.env.NODE_ENV !== "production" && (process.env.AUTH_MAIL_DRIVER ?? "").trim() === "outbox") {
    return { kind: "outbox", dir: (process.env.AUTH_MAIL_OUTBOX ?? "").trim() || ".dev-outbox" };
  }
  return null;
}

/**
 * Optional Reply-To shared by every auth email. The From address must sit on a domain verified with
 * Resend — `gmail.com` is refused with 403 — but a reply can point anywhere, so a monitored inbox
 * (support@, or a Gmail account) is where a human answers. Unset means no Reply-To header.
 */
export function authReplyTo(): string | undefined {
  const value = (process.env.AUTH_EMAIL_REPLY_TO ?? "").trim();
  return value.length > 0 ? value : undefined;
}

/** Structural so the sandbox used by the route tests can pass a bare `{ ok }` object. */
type FetchLikeResult = {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
};

async function describeFailure(result: FetchLikeResult): Promise<{
  status?: number;
  reason?: string;
  retryAfterSeconds?: number;
}> {
  const status = typeof result.status === "number" ? result.status : undefined;
  let reason: string | undefined;
  try {
    if (typeof result.json === "function") {
      const body = (await result.json()) as { name?: unknown; message?: unknown; error?: unknown } | null;
      const raw = body?.message ?? body?.error ?? body?.name;
      if (typeof raw === "string" && raw.length > 0) reason = raw.slice(0, 200);
    }
  } catch {
    reason = undefined;
  }
  // Resend does not publish its reset time in a header we can rely on, so a 429 gets a flat minute,
  // matching the "wait a minute" copy the screens already show.
  return { status, reason, retryAfterSeconds: status === 429 ? 60 : undefined };
}

/** Deliver one auth message through the chosen channel. Never throws. */
export async function sendAuthMail(channel: MailChannel, message: AuthMailMessage): Promise<MailResult> {
  if (channel.kind === "resend") {
    const payload: Record<string, unknown> = {
      from: channel.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      tags: [{ name: "flow", value: message.flow }],
    };
    if (message.html) payload.html = message.html;
    if (message.replyTo) payload.reply_to = message.replyTo;
    try {
      const result = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${channel.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (result.ok) return { kind: "sent" };
      const failure = await describeFailure(result);
      console.error(
        `[auth-mail] Resend rejected "${message.subject}" for ${message.to}: HTTP ${failure.status ?? "?"}` +
          `${failure.reason ? ` - ${failure.reason}` : ""}`,
      );
      return { kind: "failed", ...failure };
    } catch {
      console.error(`[auth-mail] Resend unreachable for "${message.subject}": the request did not complete.`);
      return { kind: "failed" };
    }
  }
  try {
    const file = `${channel.dir}/${message.flow}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    mkdirSync(channel.dir, { recursive: true });
    const record = {
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? null,
      flow: message.flow,
      createdAt: new Date().toISOString(),
      note: "Development outbox: this message was NOT emailed.",
    };
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    console.warn(`[auth-mail] DEV OUTBOX (never in production) - "${message.subject}" for ${message.to} written to ${file}`);
    return { kind: "outbox", file };
  } catch {
    return { kind: "failed" };
  }
}