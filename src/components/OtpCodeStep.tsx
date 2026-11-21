"use client";
import { useState } from "react";
import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";
import { DEMO_OTP, OTP_MAX_LENGTH, normaliseOtp, otpErrorCopy, otpProblem } from "@/lib/otp";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Card";

/**
 * Email OTP entry for password reset only. Registration is verified with an emailed link
 * (owner decision, 21 November 2026); only recovery uses a 6-digit code.
 *
 * Backend: the code is issued by `POST /api/auth/recovery-code` (service-role admin API plus the
 * project's own mail sender), and `verifyOtp({ type: "recovery" })` exchanges it for the session
 * that `/reset-password` uses to set the new password. Demo mode: no request leaves the browser and
 * the fixed demo code is shown in the field hint.
 *
 * The copy never states an exact expiry: that is a project setting, not something this form knows.
 */
export function OtpCodeStep({
  email,
  notice,
  onVerified,
  onBack,
}: {
  email: string;
  /** Extra context about how the code was delivered (for example a development outbox). */
  notice?: string | null;
  onVerified: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

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
      const payload = (await resendResponse.json().catch(() => null)) as { error?: string; devChannel?: string } | null;
      if (!resendResponse.ok) throw new Error(payload?.error || "A new code could not be sent.");
      // Never claim an email went out when the development outbox carried the code.
      setInfo(payload?.devChannel === "outbox"
        ? `A new code was written to the development outbox for ${email}. Nothing was emailed.`
        : `A new code was sent to ${email}.`);
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
        {notice ? `Written for ${email}.` : `Sent to ${email}.`} Codes are single use; request a new one if it expires.
      </p>
      {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}
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