/**
 * M2 — email one-time passcode (OTP) helpers.
 *
 * Owner decision, 21 November 2026: registration is verified with an **emailed confirmation link**
 * (`generateLink({ type: "signup" })`), while password reset uses an **emailed code**
 * (`generateLink({ type: "recovery" })` then `verifyOtp({ type: "recovery" })`). Both are delivered
 * by M2 through Resend — see docs/M2-BACKEND.md.
 *
 * Code length remains a Supabase project setting (6-10 digits); this project issues 8, so the field
 * accepts any length in range and never pins one. The expiry window is read from
 * `AUTH_OTP_EXPIRY_SECONDS` in src/lib/auth-otp-expiry.ts and must match the project setting.
 *
 * Pure module: no network, no environment, no Supabase import. Backend behaviour lives in the
 * screens; these helpers only normalise input and turn error codes into usable copy.
 */

/**
 * Supabase's OTP length is a project setting (`mailer_otp_length`), not a constant: the default is
 * 6, and this project issues 8 (verified against the live project on 21 November 2026 with
 * `generateLink({ type: "recovery" })`). Nothing here may hardcode one length, or a project
 * setting change silently breaks password reset.
 */
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

/** Code accepted only in the opt-in presentation mode; never used in backend mode. */
export const DEMO_OTP = "000000";

/** Keep digits only and cap at the longest code the field accepts (paste-friendly). */
export function normaliseOtp(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH);
}

/** Null when the input is a usable code; otherwise a message for the field. */
export function otpProblem(raw: string): string | null {
  const code = normaliseOtp(raw);
  if (code.length === 0) return "Enter the code from the email.";
  if (code.length < OTP_MIN_LENGTH || code.length > OTP_MAX_LENGTH) {
    return `Enter the whole code from the email. It is at least ${OTP_MIN_LENGTH} digits.`;
  }
  return null;
}

const OTP_ERROR_COPY: Record<string, string> = {
  otp_expired: "That code has expired or was already used. Request a new one.",
  over_email_send_rate_limit: "Too many emails were requested. Wait a minute, then try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute, then try again.",
  validation_failed: "The code could not be checked. Request a new one and try again.",
};

/**
 * Prefer our wording for the codes we know; otherwise keep Supabase's own message (never a
 * generic "something went wrong", which would hide a rate limit or a missing template).
 */
export function otpErrorCopy(code: string | null | undefined, message: string): string {
  const copy = code ? OTP_ERROR_COPY[code] : undefined;
  return copy ?? message;
}

/** A verified account that has not confirmed its email yet — route it to the code step. */
export function isUnconfirmedEmailError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "email_not_confirmed";
}

/**
 * "5 minutes" for a window in seconds. Used by the email bodies and by the screens, always from the
 * server-supplied value, so the copy cannot drift from the configured expiry.
 */
export function formatOtpExpiry(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}