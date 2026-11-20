"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEMO_MODE } from "@/lib/m2-mode";
import { getSupabase } from "@/lib/supabase";
import { demoSignIn } from "@/lib/demo-store";
import { authPath } from "@/lib/checkout-path";
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
    if (DEMO_MODE) demoSignIn(email, mode === "signup");
    else {
      const auth = getSupabase().auth;
      const { data, error } = mode === "signup"
        ? await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/account/subscription" } })
        : await auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) { setPassword(""); setInfo("Check your email to confirm your account, then log in."); return; }
    }
    setPassword("");
    router.push(next ?? (mode === "signup" ? "/pricing" : "/account/subscription"));
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
            value={password} onChange={(e) => setPassword(e.target.value)}
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
