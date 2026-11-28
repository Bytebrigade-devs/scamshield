"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";
import { demoSignIn } from "@/lib/demo-store";
import { authPath } from "@/lib/checkout-path";
import { formatOtpExpiry, isUnconfirmedEmailError } from "@/lib/otp";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Card";
import { ShieldIcon } from "@/components/ui/icons";

export default function AuthForm({ mode, next = null }: { mode: "signup" | "login"; next?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Signup is verified by an emailed confirmation link; only password reset uses a code
  // (owner decision, 21 November 2026). `confirmEmail` enables the resend action for an account
  // that was created but not confirmed yet.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // Clearing the visible password field must not break "Resend confirmation email": Supabase's
  // signup link generation requires the password, so the typed value is kept here until the screen
  // is left. It is no more exposed than the input it came from — the value was already POSTed to
  // this app's own route.
  const passwordRef = useRef("");

  async function resendConfirmation(address: string, currentPassword: string) {
    setResending(true);
    setError(null);
    try {
      const register = await fetch("/api/auth/confirmation-link", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, resend: true, password: currentPassword }),
      });
      const payload = (await register.json().catch(() => null)) as
        { error?: string; expiresInSeconds?: number } | null;
      let seconds: number | null = null;
      if (register.status === 503) {
        const { error: resendError } = await getSupabase().auth.resend({ type: "signup", email: address });
        if (resendError) throw resendError;
      } else if (!register.ok) {
        throw new Error(payload?.error || "The confirmation email could not be sent.");
      } else if (typeof payload?.expiresInSeconds === "number" && payload.expiresInSeconds > 0) {
        seconds = payload.expiresInSeconds;
      }
      const window = seconds === null ? "" : ` It expires in ${formatOtpExpiry(seconds)}.`;
      setInfo(`A new confirmation link was sent to ${address}.${window}`);
    } catch (e) { setError(e instanceof Error ? e.message : "The confirmation email could not be sent."); }
    finally { setResending(false); }
  }

  /** One place for the "we emailed you" state, so the window and the copy cannot drift apart. */
  function awaitConfirmation(address: string, seconds: number | null) {
    setPassword("");
    setConfirmEmail(address);
    const window = seconds === null ? "" : ` It expires in ${formatOtpExpiry(seconds)}.`;
    setInfo(`Check your email for the confirmation link.${window} Then log in.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
    setInfo(null);
    if (mode === "signup" && password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const destination = next ?? (mode === "signup" ? "/pricing" : "/account/subscription");
      if (DEMO_MODE) {
        demoSignIn(email, mode === "signup");
        setPassword("");
        router.push(destination);
        return;
      }
      const auth = getSupabase().auth;
      if (mode === "signup") {
        // M2 sends the verification link through the project's configured sender (Resend). When no
        // sender is configured the route answers 503 and Supabase's own confirmation mail is used.
        const register = await fetch("/api/auth/confirmation-link", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (register.status !== 503) {
          const payload = (await register.json().catch(() => null)) as
            { error?: string; expiresInSeconds?: number } | null;
          if (!register.ok) throw new Error(payload?.error || "The account could not be created.");
          awaitConfirmation(
            email.trim(),
            typeof payload?.expiresInSeconds === "number" && payload.expiresInSeconds > 0
              ? payload.expiresInSeconds
              : null,
          );
          return;
        }
        const { data, error: signUpError } = await auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/account/subscription" },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          // Confirmation is required: the emailed link activates the account. Supabase's own mailer
          // delivered this one, so the window is the project setting and is not reported here.
          awaitConfirmation(email.trim(), null);
          return;
        }
      } else {
        const { error: signInError } = await auth.signInWithPassword({ email, password });
        if (signInError) {
          if (isUnconfirmedEmailError(signInError)) {
            setConfirmEmail(email.trim());
            setInfo("This account is not confirmed yet. Use the link we emailed you, or send it again below.");
            return;
          }
          throw signInError;
        }
      }
      setPassword("");
      router.push(destination);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to connect. Please retry."); }
    finally { setBusy(false); }
  }

  const isSignup = mode === "signup";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 self-center text-lg font-bold text-brand">
        <ShieldIcon className="text-primary" /> ScamShield
      </Link>
      <Card className="p-8">
        <h1 className="text-[28px] font-bold leading-tight">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-muted">
          {isSignup ? "Start protecting your digital life in a minute." : "Log in to manage your plan."}
        </p>
        {DEMO_MODE && <p className="mt-3 text-sm text-muted">Frontend demo: use any email and a dummy password. Nothing is authenticated or sent to a server.</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field
            label="Email" type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password" type="password" required minLength={isSignup ? 8 : undefined}
            autoComplete={isSignup ? "new-password" : "current-password"}
            hint={isSignup ? "At least 8 characters." : undefined}
            error={passwordError}
            value={password} onChange={(e) => { setPassword(e.target.value); passwordRef.current = e.target.value; }}
          />
          {!isSignup && <Link href="/forgot-password" className="link inline-block text-sm">Forgot password?</Link>}
          {DEMO_MODE && !isSignup && <Button variant="secondary" block onClick={() => { demoSignIn("demo@scamshield.test"); router.push("/account/subscription"); }}>Use demo account</Button>}
          {error && <Alert tone="danger">{error}</Alert>}
          {info && <Alert tone="success">{info}</Alert>}
          <Button
            type="submit" block size="lg" loading={busy}
            loadingLabel={isSignup ? "Creating account…" : "Logging in…"}
          >
            {isSignup ? "Sign up" : "Log in"}
          </Button>
          {confirmEmail && !DEMO_MODE && (
            <Button
              variant="secondary" block disabled={busy} loading={resending} loadingLabel="Sending…"
              onClick={() => void resendConfirmation(confirmEmail, passwordRef.current)}
            >
              Resend confirmation email
            </Button>
          )}
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        {isSignup ? "Already have an account? " : "No account yet? "}
        <Link className="link" href={authPath(isSignup ? "login" : "signup", next)}>
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </main>
  );
}
