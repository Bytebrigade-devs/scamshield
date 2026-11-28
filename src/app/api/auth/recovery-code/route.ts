import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authReplyTo, mailChannel, sendAuthMail } from "@/lib/auth-mail";
import { recoveryEmail } from "@/lib/auth-email-templates";
import { otpExpiryLabel, otpExpirySeconds } from "@/lib/auth-otp-expiry";
import { DeliveryThrottled, createBudgetedLimiter, issueRecoveryCode } from "@/lib/recovery-code";
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
const limiter = createBudgetedLimiter({ windowMs: 10 * 60_000, addressMax: 3, callerMax: 20 });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
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
      sendCode: async (address, code) => {
        const mail = recoveryEmail(code, otpExpiryLabel());
        const result = await sendAuthMail(channel!, {
          to: address,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          flow: "recovery",
          replyTo: authReplyTo(),
        });
        // A provider throttle is not a permanent failure: say "wait", do not say "try again now".
        if (result.kind === "failed" && result.status === 429) {
          throw new DeliveryThrottled(result.retryAfterSeconds ?? 60);
        }
        return result.kind !== "failed";
      },
    },
    limiter,
    { email, caller },
  );

  switch (outcome.kind) {
    case "sent":
      // `devChannel` can only appear outside a production build; it tells the UI where to look.
      // `expiresInSeconds` is the window the email itself states, so the countdown cannot drift
      // from the project setting. It is not a secret: the token is what grants access, not the
      // length of its life.
      return response({
        ok: true,
        expiresInSeconds: otpExpirySeconds(),
        ...(channel?.kind === "outbox" ? { devChannel: "outbox" } : {}),
      });
    case "rate-limited": {
      const minutes = Math.max(1, Math.round(outcome.retryAfterSeconds / 60));
      return response(
        {
          error: `Too many reset requests. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          retryAfterSeconds: outcome.retryAfterSeconds,
        },
        429,
      );
    }
    case "delivery-throttled": {
      const minutes = Math.max(1, Math.round(outcome.retryAfterSeconds / 60));
      return response(
        {
          error: `The email service is busy right now. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          retryAfterSeconds: outcome.retryAfterSeconds,
        },
        429,
      );
    }
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