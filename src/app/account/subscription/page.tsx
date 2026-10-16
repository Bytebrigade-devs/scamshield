"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import type { Subscription } from "@/lib/plans";

export default function SubscriptionPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "GET" | "DELETE") {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) {
      router.push("/login");
      return null;
    }
    const res = await fetch("/api/subscription", {
      method,
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Request failed");
      return null;
    }
    return json.subscription as Subscription | null;
  }

  useEffect(() => {
    call("GET").then((s) => {
      setSub(s);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel() {
    if (!confirm("Cancel Premium and return to the Free plan?")) return;
    const s = await call("DELETE");
    if (s) setSub(s);
  }

  async function logout() {
    await getSupabase().auth.signOut();
    router.push("/");
  }

  if (loading) return <main className="p-8">Loading...</main>;

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Your subscription</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!sub ? (
        <p className="mt-4">
          No plan selected yet. <Link href="/pricing" className="text-blue-600 underline">Choose a plan</Link>
        </p>
      ) : (
        <div className="mt-4 rounded-lg border bg-white p-4 text-sm">
          <p>Plan: <b className="capitalize">{sub.plan}</b></p>
          <p>Status: <b className="capitalize">{sub.status}</b></p>
          {sub.billing_cycle && <p>Billing: {sub.billing_cycle}</p>}
          {sub.renews_at && <p>Renews: {new Date(sub.renews_at).toLocaleDateString()}</p>}
          {sub.cancelled_at && <p>Cancelled: {new Date(sub.cancelled_at).toLocaleDateString()}</p>}
          <div className="mt-4 flex gap-2">
            {sub.plan === "premium" ? (
              <button onClick={cancel} className="rounded border px-3 py-1">Cancel subscription</button>
            ) : (
              <Link href="/pricing" className="rounded bg-blue-600 px-3 py-1 text-white">Upgrade</Link>
            )}
          </div>
        </div>
      )}
      <button onClick={logout} className="mt-6 text-sm text-slate-500 underline">Log out</button>
    </main>
  );
}
