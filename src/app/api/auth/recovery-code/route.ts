import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInMemoryLimiter, issueRecoveryCode } from "@/lib/recovery-code";
import { OTP_MAX_LENGTH, OTP_MIN_LENGTH } from "@/lib/otp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * `POST /api/auth/recovery-code` — issue a password-reset code by email.
 *
 * The code is produced by Supabase's service-role admin API and delivered through Resend, so it
 * does not depend on the project's SMTP configuration. The response is identical for a known and
 * an unknown address, and never contains the code. See src/lib/recovery-code.ts for the rules.
 *
 * Unauthenticated by necessity (this is account recovery); abuse is bounded by the per-address and
 * per-caller limiter below, which is in memory per process.
 */
const limiter = createInMemoryLimiter({ windowMs: 10 * 60_000, max: 3 });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mailConfig(): { apiKey: string; from: string } | null {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.AUTH_EMAIL_FROM ?? process.env.TRIAL_EMAIL_FROM ?? "").trim();
  return apiKey.length > 0 && from.length > 0 ? { apiKey, from } : null;
}

/** Resend when it is configured; otherwise a development-only local outbox. */
type MailChannel = { kind: "resend"; apiKey: string; from: string } | { kind: "outbox"; dir: string };

function mailChannel(): MailChannel | null {
  const resend = mailConfig();
  if (resend) return { kind: "resend", ...resend };
  // Development escape hatch. Writing a reset code to disk is allowed only outside a production
  // build AND only when explicitly requested; in production a missing sender stays a hard 503.
  if (process.env.NODE_ENV !== "production" && (process.env.AUTH_MAIL_DRIVER ?? "").trim() === "outbox") {
    return { kind: "outbox", dir: (process.env.AUTH_MAIL_OUTBOX ?? "").trim() || ".dev-outbox" };
  }
  return null;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const SUBJECT = "Your ScamShield password reset code";

async function deliver(channel: MailChannel, to: string, code: string): Promise<boolean> {
  if (channel.kind === "resend") {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: channel.from,
        to: [to],
        subject: SUBJECT,
        text: `Your ScamShield password reset code is ${code}.\n\nIt can be used once and expires soon. If you did not ask to reset your password, ignore this email - your password stays unchanged.`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return result.ok;
  }
  // Development outbox: the code goes to a gitignored folder and the server terminal instead of an
  // inbox, so the flow can be exercised with no mail provider. Unreachable in a production build.
  const file = `${channel.dir}/recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  mkdirSync(channel.dir, { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ to, subject: SUBJECT, code, createdAt: new Date().toISOString(), note: "Development outbox: this code was NOT emailed." }, null, 2)}\n`,
    "utf8",
  );
  console.warn(`[recovery-code] DEV OUTBOX (never in production) - code ${code} for ${to} written to ${file}`);
  return true;
}

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const supplied = (body as { email?: unknown } | null)?.email;
  const email = typeof supplied === "string" ? supplied.trim().toLowerCase() : "";
  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return response({ error: "Enter the email address of your account." }, 400);
  }

  const channel = mailChannel();
  const admin = adminClient();
  // Caller identity comes from the connection, never from the request body.
  const caller = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";

  const outcome = await issueRecoveryCode(
    email,
    {
      mailConfigured: channel !== null && admin !== null,
      generateCode: async (address) => {
        const { data, error } = await admin!.auth.admin.generateLink({ type: "recovery", email: address });
        // An unknown address and an admin failure are deliberately indistinguishable here.
        if (error) return null;
        // The SDK nests the code under `properties`; the flat REST shape is accepted too. The length
        // is a project setting — this project issues 8 digits, the Supabase default is 6 — so it is
        // never pinned to one value (verified against the live project, 21 November 2026).
        const otp = data?.properties?.email_otp ?? (data as { email_otp?: unknown } | null)?.email_otp;
        const shape = new RegExp(`^\\d{${OTP_MIN_LENGTH},${OTP_MAX_LENGTH}}$`);
        if (typeof otp !== "string" || !shape.test(otp)) throw new Error("recovery-code-unavailable");
        return otp;
      },
      sendCode: (address, code) => deliver(channel!, address, code),
    },
    limiter,
    { email, caller },
  );

  switch (outcome.kind) {
    case "sent":
      // `devChannel` can only appear outside a production build; it tells the UI where to look.
      return response(channel?.kind === "outbox" ? { ok: true, devChannel: "outbox" } : { ok: true });
    case "rate-limited":
      return response(
        { error: "Too many reset requests. Wait a few minutes, then try again.", retryAfterSeconds: outcome.retryAfterSeconds },
        429,
      );
    case "mail-not-configured":
      return response(
        {
          error: "Email delivery is not configured on this server. Set RESEND_API_KEY and AUTH_EMAIL_FROM - or, for local development only, AUTH_MAIL_DRIVER=outbox - then restart the server.",
        },
        503,
      );
    default:
      return response({ error: "The reset code could not be issued. Try again." }, 502);
  }
}

export function GET() {
  return response({ error: "Use POST to request a password reset code." }, 405);
}