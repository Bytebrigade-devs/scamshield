"use client";
import { useState } from "react";
import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";
import { DEMO_OTP, OTP_LENGTH, normaliseOtp, otpErrorCopy, otpProblem } from "@/lib/otp";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Card";

/**
 * Email OTP entry for password reset only. Registration is verified with an emailed link
 * (owner decision, 21 November 2026); only recovery uses a 6-digit code.
 *
 * Backend: `verifyOtp({ type: "recovery" })` exchanges the code for the session that
 * `/reset-password` uses to set the new password. Demo mode: no request leaves the browser and
 * the fixed demo code is shown in the field hint.
 *
 * The copy never states an exact expiry: that is a project setting, not something this form knows.
 */
export function OtpCodeStep({
  email,
  onVerified,
  onBack,
}: {
  email: string;
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
      const { error: resendError } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (resendError) throw resendError;
      setInfo(`A new code was sent to ${email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "A new code could not be sent. Please retry.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold leading-tight">Enter your reset code</h1>
      <p className="mt-1 text-muted">Enter the {OTP_LENGTH}-digit code we emailed to choose a new password.</p>
      <p className="mt-2 text-sm text-muted">Sent to {email}. Codes are single use; request a new one if it expires.</p>
      <form onSubmit={verify} className="mt-6 space-y-4">
        <Field
          label="Code"
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          placeholder={"0".repeat(OTP_LENGTH)}
          hint={DEMO_MODE ? `Demo code: ${DEMO_OTP}. No email is sent.` : `${OTP_LENGTH} digits from the email.`}
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