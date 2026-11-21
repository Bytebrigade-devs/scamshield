/**
 * M2 — email one-time passcode (OTP) helpers.
 *
 * Owner decision, 21 November 2026: registration is verified with an **emailed confirmation link**
 * (`{{ .ConfirmationURL }}`), while password reset uses a **6-digit emailed code**
 * (`resetPasswordForEmail` then `verifyOtp({ type: "recovery" })`). Both are delivered by Supabase
 * Auth through the project's SMTP sender — see docs/M2-BACKEND.md.
 *
 * Code length and expiry are project settings, so nothing here hardcodes an expiry claim.
 *
 * Pure module: no network, no environment, no Supabase import. Backend behaviour lives in the
 * screens; these helpers only normalise input and turn error codes into usable copy.
 */

/** Digits in a Supabase email OTP (the project default). */
export const OTP_LENGTH = 6;

/** Code accepted only in the opt-in presentation mode; never used in backend mode. */
export const DEMO_OTP = "000000";

/** Keep digits only and cap at the expected length (paste-friendly). */
export function normaliseOtp(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/** Null when the input is a usable code; otherwise a message for the field. */
export function otpProblem(raw: string): string | null {
  const code = normaliseOtp(raw);
  if (code.length === 0) return "Enter the code from the email.";
  if (code.length !== OTP_LENGTH) return `The code is ${OTP_LENGTH} digits. Check the email and try again.`;
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