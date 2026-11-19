"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Card";

import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";

export default function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [value, setValue] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [error, setError] = useState("");
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
        if (error || !data.session) setError("Open a valid password recovery link from your email.");
        else { setReady(true); setError(""); }
      }).catch(() => setError("Unable to verify your recovery session. Request a new link."));
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
      if (!DEMO_MODE) {
        if (reset && !ready) throw new Error("Open a valid password recovery link first.");
        const { error } = reset
          ? await getSupabase().auth.updateUser({ password: value })
          : await getSupabase().auth.resetPasswordForEmail(value, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        if (reset) await getSupabase().auth.signOut();
      }
      setDone(true); setValue(""); setConfirm("");
    } catch (e) { setError(e instanceof Error ? e.message : "Password recovery unavailable."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"><Card className="p-8"><h1 className="text-[28px] font-bold">{reset ? "Set a new password" : "Reset your password"}</h1>
    <p className="mt-3 text-sm text-muted">{DEMO_MODE ? "Demo only. No email is sent and no password is stored." : "Use your account email to recover access."}</p>
    {done ? <div className="mt-6 space-y-4"><Alert tone="success">{reset ? "Password updated. Return to login." : DEMO_MODE ? "Your demo reset link is ready." : "If this address has an account, check your email for a recovery link."}</Alert>{(reset || DEMO_MODE) && <Link href={reset ? "/login" : "/reset-password"} className="link">{reset ? "Go to login" : "Open demo reset link"}</Link>}<Button variant="text" block onClick={() => setDone(false)}>Try again</Button></div> : <form className="mt-6 space-y-4" onSubmit={submit}>
    <Field label={reset ? "New password" : "Email"} type={reset ? "password" : "email"} autoComplete="off" required minLength={reset ? 8 : undefined} value={value} onChange={e => setValue(e.target.value)}/>
    {reset && <Field label="Confirm password" type="password" autoComplete="off" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}/>}
    {error && <Alert tone="danger">{error}</Alert>}
    <Button type="submit" disabled={reset && !ready} block loading={busy} loadingLabel="Please wait…">{reset ? "Update password" : "Send reset link"}</Button>
  </form>}</Card><Link href="/login" className="link mt-6 text-center">Back to login</Link></main>;
}
