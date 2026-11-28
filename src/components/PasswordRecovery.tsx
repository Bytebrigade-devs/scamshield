"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Card";
import { OtpCodeStep } from "@/components/OtpCodeStep";

import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";

/**
 * Password recovery in two steps: request a code by email, then enter it.
 *
 * `reset` renders the second half (`/reset-password`), which sets the new password from the
 * session the code produced. A recovery link still works: Supabase emits `PASSWORD_RECOVERY`
 * and that session is accepted here, so switching the email template back to a link does not
 * break this screen.
 */
export default function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"request" | "code">("request");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [expiresInSeconds, setExpiresInSeconds] = useState<number | null>(null);
  const [channel, setChannel] = useState<"supabase" | "m2" | "outbox">("supabase");
  const [ready, setReady] = useState(DEMO_MODE || !reset);
  useEffect(() => {
    if (DEMO_MODE || !reset) return;
    try {
      const client = getSupabase();
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" && session) { setReady(true); setError(""); }
      });
      // getSession waits for URL token processing. Supabase validates the
      // session again on updateUser; an ordinary signed-in user may also change it.
      void client.auth.getSession().then(({ data, error }) => {
        if (error || !data.session) setError("Enter the code from your email to continue, then set a new password.");
        else { setReady(true); setError(""); }
      }).catch(() => setError("Unable to verify your recovery session. Request a new code."));
      return () => listener.subscription.unsubscribe();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Account service unavailable.";
      // The Supabase client throws synchronously when its configuration is missing,
      // so the message can only surface after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(message);
    }
  }, [reset]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (reset && (value.length < 8 || value !== confirm)) { setError("Use at least 8 characters and matching passwords."); return; }
    setBusy(true);
    try {
      if (DEMO_MODE) {
        // Demo mode: no email and no password is stored; the code step stays visible.
        if (reset) setDone(true);
        else { setRequestedEmail(value.trim()); setStep("code"); }
      } else if (reset) {
        if (!ready) throw new Error("Enter the code from your email first.");
        const { error: updateError } = await getSupabase().auth.updateUser({ password: value });
        if (updateError) throw updateError;
        await getSupabase().auth.signOut();
        setDone(true);
      } else {
        // M2's sender (Resend, or the development outbox) is tried first; when no sender is
        // configured the route answers 503 and Supabase's own recovery mail takes over. Delivery
        // through Supabase is therefore the fallback, not the preferred path.
        const address = value.trim();
        let nextChannel: "supabase" | "m2" | "outbox" = "m2";
        const sendResponse = await fetch("/api/auth/recovery-code", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address }),
        });
        const payload = (await sendResponse.json().catch(() => null)) as
          { error?: string; devChannel?: string; expiresInSeconds?: number } | null;
        if (sendResponse.status === 503) {
          const { error: supabaseError } = await getSupabase().auth.resetPasswordForEmail(address, {
            redirectTo: window.location.origin + "/reset-password",
          });
          if (supabaseError) throw new Error(supabaseError.message);
          nextChannel = "supabase";
          // Supabase's own mail carries a link in the current template, so no window is known here.
          setExpiresInSeconds(null);
        } else if (!sendResponse.ok) {
          throw new Error(payload?.error || "The reset code could not be sent.");
        } else {
          nextChannel = payload?.devChannel === "outbox" ? "outbox" : "m2";
          setExpiresInSeconds(
            typeof payload?.expiresInSeconds === "number" && payload.expiresInSeconds > 0
              ? payload.expiresInSeconds
              : null,
          );
        }
        setChannel(nextChannel);
        // A development outbox means nothing was emailed; say so instead of implying an inbox.
        setNotice(nextChannel === "outbox"
          ? "Development mode: nothing was emailed. The code is printed in the server terminal and saved in the .dev-outbox folder."
          : null);
        setRequestedEmail(address);
        setStep("code");
      }
      setValue(""); setConfirm("");
    } catch (e) { setError(e instanceof Error ? e.message : "Password recovery unavailable."); }
    finally { setBusy(false); }
  }
  if (!reset && step === "code") {
    return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Card className="p-8">
        <OtpCodeStep
          email={requestedEmail}
          notice={notice}
          showLinkHint={channel === "supabase" && !DEMO_MODE}
          expiresInSeconds={expiresInSeconds}
          onVerified={() => router.push("/reset-password")}
          onBack={() => { setStep("request"); setError(""); }}
        />
      </Card>
      <Link href="/login" className="link mt-6 text-center">Back to login</Link>
    </main>;
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"><Card className="p-8"><h1 className="text-[28px] font-bold">{reset ? "Set a new password" : "Reset your password"}</h1>
    <p className="mt-3 text-sm text-muted">{DEMO_MODE ? "Demo only. No email is sent and no password is stored." : reset ? "Choose a new password for your account." : "We will email you a code to confirm it is you."}</p>
    {done ? <div className="mt-6 space-y-4"><Alert tone="success">Password updated. Return to login.</Alert><Link href="/login" className="link">Go to login</Link></div> : <form className="mt-6 space-y-4" onSubmit={submit}>
    <Field label={reset ? "New password" : "Email"} type={reset ? "password" : "email"} autoComplete="off" required minLength={reset ? 8 : undefined} value={value} onChange={e => setValue(e.target.value)}/>
    {reset && <Field label="Confirm password" type="password" autoComplete="off" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}/>}
    {error && <Alert tone="danger">{error}</Alert>}
    <Button type="submit" disabled={reset && !ready} block loading={busy} loadingLabel="Please wait…">{reset ? "Update password" : "Send code"}</Button>
  </form>}</Card><Link href="/login" className="link mt-6 text-center">Back to login</Link></main>;
}
