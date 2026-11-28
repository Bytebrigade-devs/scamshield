import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authReplyTo, mailChannel, sendAuthMail } from "@/lib/auth-mail";
import { confirmationEmail } from "@/lib/auth-email-templates";
import { otpExpiryLabel, otpExpirySeconds } from "@/lib/auth-otp-expiry";
import { createBudgetedLimiter } from "@/lib/recovery-code";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * `POST /api/auth/confirmation-link` — create an account and email its verification link through
 * the project's configured sender (Resend, or the development outbox).
 *
 * The account is created with the service-role admin API with email confirmation left off, so
 * Supabase sends nothing: M2 owns this email. The link is Supabase's own confirmation URL
 * (`generateLink({ type: "signup" })`), so clicking it verifies the account exactly as the built-in
 * flow would. If the mail cannot be sent, the freshly created account is deleted again, so a failed
 * send never leaves an unusable unverified row behind.
 *
 * Resend safety: verified live on 28 November 2026, `generateLink({ type: "signup" })` CREATES an
 * unconfirmed account when the address is unknown, using the password supplied by the caller. A
 * resend must therefore never reach it for an address the caller does not control. The route first
 * proves the credentials with `signInWithPassword`: GoTrue answers `email_not_confirmed` only when
 * the account exists AND the password is correct. An unknown address or a wrong password both get
 * the same content-free `200 {ok:true}` and no mail, so this endpoint cannot enumerate accounts.
 *
 * Body: `{ email, password }` to register, or `{ email, resend: true, password }` to re-send the
 * link for an account that already exists but is not confirmed yet. The password is required in
 * both cases: it is the credential the probe checks, and it binds the signup link.
 */
// The confirmation link is a weaker lever than a reset code — it only activates an account whose
// password the requester already set — so its address budget is 5 rather than the recovery route's
// 3. With a five-minute window, users legitimately ask for the link several times in a row.
const limiter = createBudgetedLimiter({ windowMs: 10 * 60_000, addressMax: 5, callerMax: 20 });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anon client used only to check credentials before a resend. It never holds the service key. */
function authProbeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const record = (body ?? {}) as { email?: unknown; password?: unknown; resend?: unknown };
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const resendOnly = record.resend === true;
  const password = typeof record.password === "string" ? record.password : "";
  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return response({ error: "Enter a valid email address." }, 400);
  }
  // A resend needs the password: the credential probe below checks it, and Supabase's signup link
  // generation requires it. The caller has always just typed it (signup form, or a login attempt
  // that found the account unconfirmed). Rate limiting bounds what a wrong guess can do here.
  if (password.length < 8) {
    return response(
      { error: resendOnly ? "Enter your password to resend the confirmation link." : "Password must be at least 8 characters." },
      400,
    );
  }

  const channel = mailChannel();
  const admin = adminClient();
  if (!channel || !admin) {
    return response(
      {
        error: "Email delivery is not configured on this server. Set RESEND_API_KEY and AUTH_EMAIL_FROM - or, for local development only, AUTH_MAIL_DRIVER=outbox - then restart the server.",
      },
      503,
    );
  }

  const now = Date.now();
  const caller = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
  const addressWait = limiter.take(`address:${email}`, now);
  if (addressWait > 0) return response({ error: "Too many requests for this address. Wait a few minutes, then try again." }, 429);
  const callerWait = limiter.take(`caller:${caller}`, now);
  if (callerWait > 0) return response({ error: "Too many requests. Wait a few minutes, then try again." }, 429);

  if (resendOnly) {
    // Never generate a signup link before proving the caller controls the account: on an unknown
    // address Supabase creates the account with the supplied password (verified live, 28 November
    // 2026). GoTrue answers `email_not_confirmed` only for an existing account whose password is
    // correct, so that is the one case allowed to continue below.
    const probe = authProbeClient();
    if (!probe) {
      return response(
        { error: "Account checks are not configured on this server. Set NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the server." },
        503,
      );
    }
    const signIn = await probe.auth.signInWithPassword({ email, password });
    const probeStatus = signIn.error?.status;
    if (probeStatus === 429) {
      return response({ error: "Too many attempts. Wait a minute, then try again.", retryAfterSeconds: 60 }, 429);
    }
    if (signIn.error && (probeStatus === 0 || (typeof probeStatus === "number" && probeStatus >= 500))) {
      return response({ error: "The account could not be checked. Try again." }, 502);
    }
    if (signIn.error?.code !== "email_not_confirmed") {
      // Unknown address, wrong password, or an account that is already confirmed. All three are
      // answered the same way, and nothing is created, generated or sent.
      return response({ ok: true, expiresInSeconds: otpExpirySeconds() });
    }
  }

  let createdId: string | null = null;
  if (!resendOnly) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: false });
    if (created.error) {
      const message = created.error.message ?? "";
      if (/already registered|already exists/i.test(message)) {
        return response({ error: "An account with this email already exists. Log in instead." }, 409);
      }
      return response({ error: "The account could not be created. Try again." }, 502);
    }
    createdId = created.data.user?.id ?? null;
  }

  const link = await admin.auth.admin.generateLink({ type: "signup", email, password });
  const actionLink = link.data?.properties?.action_link;
  if (link.error || typeof actionLink !== "string" || actionLink.length === 0) {
    // Nothing verifiable to send: remove the row we just created so no dead account is left.
    if (createdId) await admin.auth.admin.deleteUser(createdId);
    return response({ error: "The confirmation link could not be created. Try again." }, 502);
  }

  const mail = confirmationEmail(actionLink, otpExpiryLabel());
  const delivered = await sendAuthMail(channel, {
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    flow: "confirm",
    replyTo: authReplyTo(),
  });
  if (delivered.kind === "failed") {
    // Nothing verifiable reached the mailbox, so a freshly created account would be unusable.
    if (createdId) await admin.auth.admin.deleteUser(createdId);
    if (delivered.status === 429) {
      return response(
        {
          error: "Too many confirmation emails were requested. Wait a minute, then try again.",
          retryAfterSeconds: delivered.retryAfterSeconds ?? 60,
        },
        429,
      );
    }
    return response({ error: "The confirmation email could not be sent. Try again." }, 502);
  }
  return response({
    ok: true,
    expiresInSeconds: otpExpirySeconds(),
    ...(channel.kind === "outbox" ? { devChannel: "outbox" } : {}),
  });
}

export function GET() {
  return response({ error: "Use POST to register or to resend a confirmation link." }, 405);
}