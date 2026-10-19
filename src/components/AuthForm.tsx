"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const supabase = getSupabase();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (data.session) router.push("/pricing");
      else setInfo("Check your email to confirm your account, then log in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push("/account/subscription");
    }
    setBusy(false);
  }

  const isSignup = mode === "signup";
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border p-2"
        />
        <input
          type="password" required placeholder="Password (min 8 chars)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border p-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-700">{info}</p>}
        <button disabled={busy} className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50">
          {busy ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        {isSignup ? "Already have an account? " : "No account yet? "}
        <Link className="text-blue-600 underline" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </main>
  );
}
