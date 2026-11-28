"use client";
import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";
import { DEMO_OTP, OTP_MAX_LENGTH, formatOtpExpiry, normaliseOtp, otpErrorCopy, otpProblem } from "@/lib/otp";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Card";

/** mm:ss for the countdown. Cosmetic only — Supabase enforces the real deadline. */
const mmss = (total: number): string =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

/**
 * Email OTP entry for password reset only. Registration is verified with an emailed link
 * (owner decision, 21 November 2026); only recovery uses a code.
 *
 * Backend: the code is issued by `POST /api/auth/recovery-code` (service-role admin API plus Resend),
 * and `verifyOtp({ type: "recovery" })` exchanges it for the session that `/reset-password` uses to
 * set the new password. Demo mode: no request leaves the browser and the fixed demo code is shown in
 * the field hint.
 *
 * Expiry: Supabase enforces it — the code is dead once the project's email OTP window passes and
 * `verifyOtp` answers `otp_expired`, which this form turns into usable copy. The countdown below is
 * therefore a courtesy driven by the window the server reports, not a gate: if the countdown and the
 * project setting ever disagree, the still-valid code must keep working. That is why reaching zero
 * warns and offers a new code instead of disabling Continue.
 */
export function OtpCodeStep({
  email,
  notice,
  showLinkHint = false,
  expiresInSeconds = null,
  onVerified,
  onBack,
}: {
  email: string;
  /** Extra context about how the code was delivered (for example a development outbox). */
  notice?: string | null;
  /** True when the recovery mail may carry a link instead of a code (template not switched yet). */
  showLinkHint?: boolean;
  /** The window the server stated for this code, in seconds. Null when unknown or in demo mode. */
  expiresInSeconds?: number | null;
  onVerified: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(expiresInSeconds ?? null);
  const [deadline, setDeadline] = useState<number | null>(() =>
    typeof expiresInSeconds === "number" && expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : null,
  );

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const expired = remaining === 0;

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const problem = otpProblem(code);
    if (problem !== null) {
      setError(problem);
      return;
    }
    const token = normaliseOtp(code);
    setBusy(true);
    try {
      if (DEMO_MODE) {
        if (token !== DEMO_OTP) throw new Error(`Demo mode: use the code ${DEMO_OTP}.`);
      } else {
        const { data, error: verifyError } = await getSupabase().auth.verifyOtp({ email, token, type: "recovery" });
        if (verifyError) throw new Error(otpErrorCopy(verifyError.code, verifyError.message));
        if (!data.session) throw new Error("The code was accepted but no session started. Request a new one.");
      }
      setCode("");
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The code could not be checked. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      if (DEMO_MODE) {
        setInfo(`Demo mode: no email is sent. Use the code ${DEMO_OTP}.`);
        return;
      }
      const resendResponse = await fetch("/api/auth/recovery-code", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await resendResponse.json().catch(() => null)) as
        { error?: string; devChannel?: string; expiresInSeconds?: number } | null;
      if (!resendResponse.ok) throw new Error(payload?.error || "A new code could not be sent.");
      // A fresh code restarts the clock from the window the server reports.
      if (typeof payload?.expiresInSeconds === "number" && payload.expiresInSeconds > 0) {
        setRemaining(payload.expiresInSeconds);
        setDeadline(Date.now() + payload.expiresInSeconds * 1000);
      }
      const window = typeof payload?.expiresInSeconds === "number"
        ? ` It expires in ${formatOtpExpiry(payload.expiresInSeconds)}.`
        : "";
      // Never claim an email went out when the development outbox carried the code.
      setInfo(payload?.devChannel === "outbox"
        ? `A new code was written to the development outbox for ${email}. Nothing was emailed.${window}`
        : `A new code was sent to ${email}.${window}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "A new code could not be sent. Please retry.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold leading-tight">Enter your reset code</h1>
      <p className="mt-1 text-muted">
        {notice
          ? "Enter the code from the development outbox to choose a new password."
          : "Enter the code we emailed to choose a new password."}
      </p>
      <p className="mt-2 text-sm text-muted">
        {notice ? `Written for ${email}.` : `Sent to ${email}.`} Codes are single use.
      </p>
      {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}
      {remaining !== null && remaining > 0 && (
        <p className="mt-2 text-sm text-muted">This code expires in {mmss(remaining)}.</p>
      )}
      {expired && (
        <Alert tone="danger">This code has expired. Send a new code below, then enter it here.</Alert>
      )}
      {showLinkHint && (
        <p className="mt-2 text-sm text-muted">
          If your email contains a link instead of a code, open the link — it takes you straight to the new-password
          page. Switching the project&apos;s Reset password template to `{"{{ .Token }}"}` makes the email carry this code.
        </p>
      )}
      <form onSubmit={verify} className="mt-6 space-y-4">
        <Field
          label="Code"
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_MAX_LENGTH}
          placeholder={"•".repeat(OTP_MAX_LENGTH)}
          hint={DEMO_MODE ? `Demo code: ${DEMO_OTP}. No email is sent.` : notice ? "The code from the outbox file, digits only." : "The code from the email, digits only."}
          value={code}
          onChange={(e) => setCode(normaliseOtp(e.target.value))}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}
        <Button type="submit" block size="lg" loading={busy} loadingLabel="Checking the code…">
          Continue
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="text" disabled={busy || resending} loading={resending} loadingLabel="Sending…" onClick={resend}>
            Send a new code
          </Button>
          <Button variant="text" disabled={busy} onClick={onBack}>
            Use a different email
          </Button>
        </div>
      </form>
    </div>
  );
}