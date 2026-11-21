import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInMemoryLimiter, issueRecoveryCode } from "@/lib/recovery-code";

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

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sendCode(mail: { apiKey: string; from: string }, to: string, code: string): Promise<boolean> {
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${mail.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: mail.from,
      to: [to],
      subject: "Your ScamShield password reset code",
      text: `Your ScamShield password reset code is ${code}.\n\nIt can be used once and expires soon. If you did not ask to reset your password, ignore this email - your password stays unchanged.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  return result.ok;
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

  const mail = mailConfig();
  const admin = adminClient();
  // Caller identity comes from the connection, never from the request body.
  const caller = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";

  const outcome = await issueRecoveryCode(
    email,
    {
      mailConfigured: mail !== null && admin !== null,
      generateCode: async (address) => {
        const { data, error } = await admin!.auth.admin.generateLink({ type: "recovery", email: address });
        // An unknown address and an admin failure are deliberately indistinguishable here.
        if (error) return null;
        const otp = data?.properties?.email_otp;
        if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) throw new Error("recovery-code-unavailable");
        return otp;
      },
      sendCode: (address, code) => sendCode(mail!, address, code),
    },
    limiter,
    { email, caller },
  );

  switch (outcome.kind) {
    case "sent":
      return response({ ok: true });
    case "rate-limited":
      return response(
        { error: "Too many reset requests. Wait a few minutes, then try again.", retryAfterSeconds: outcome.retryAfterSeconds },
        429,
      );
    case "mail-not-configured":
      return response(
        { error: "Email delivery is not configured on this server. Set RESEND_API_KEY and AUTH_EMAIL_FROM, then restart the server." },
        503,
      );
    default:
      return response({ error: "The reset code could not be issued. Try again." }, 502);
  }
}

export function GET() {
  return response({ error: "Use POST to request a password reset code." }, 405);
}