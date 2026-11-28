/**
 * M2 — how long an emailed auth token stays usable, as application code sees it (server only).
 *
 * The authority is the Supabase project. GoTrue validates the signup confirmation link and the
 * recovery code against one setting — `Mailer.OtpExp`, exposed on a hosted project as
 * `mailer_otp_expiry` — and it defaults to one day when unset. `/auth/v1/verify` answers to the
 * anon key, so nothing in this module enforces anything. It exists so the email body, the screen
 * copy and the countdown all agree with the project setting instead of guessing "expires soon".
 *
 * Keep `AUTH_OTP_EXPIRY_SECONDS` equal to the project setting. `pnpm verify:otp-expiry` measures the
 * live window against it and fails loudly on a disagreement.
 */
import { formatOtpExpiry } from "./otp";

export const DEFAULT_OTP_EXPIRY_SECONDS = 300;
export const MIN_OTP_EXPIRY_SECONDS = 60;
export const MAX_OTP_EXPIRY_SECONDS = 86_400;

/**
 * The configured window in seconds, clamped so a typo cannot produce a token that never expires or
 * one that is dead before the email is read. A missing or non-numeric value falls back to the
 * default rather than throwing: this runs inside a request for a password-reset email.
 */
export function otpExpirySeconds(): number {
  const raw = (process.env.AUTH_OTP_EXPIRY_SECONDS ?? "").trim();
  if (raw.length === 0) return DEFAULT_OTP_EXPIRY_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_OTP_EXPIRY_SECONDS;
  const whole = Math.round(parsed);
  return Math.min(MAX_OTP_EXPIRY_SECONDS, Math.max(MIN_OTP_EXPIRY_SECONDS, whole));
}

/** "5 minutes" — the phrase used in email bodies and on screen. */
export function otpExpiryLabel(): string {
  return formatOtpExpiry(otpExpirySeconds());
}