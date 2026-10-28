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
    if (!confirm("Are you sure you want to cancel your recurring subscription?")) return;
    const s = await call("DELETE");
    if (s) setSub(s);
  }

  async function logout() {
    await getSupabase().auth.signOut();
    router.push("/");
  }

  if (loading) return <main className="p-8 text-center text-sm text-slate-500">Loading subscription details...</main>;

  return (
    <main className="mx-auto max-w-md p-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Your Subscription</h1>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {!sub ? (
          <div className="mt-4">
            <p className="text-sm text-slate-600">No active plan recorded.</p>
            <Link
              href="/pricing"
              className="mt-3 inline-block rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              Choose a plan
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Plan</span>
              <span className="font-bold text-slate-900">{sub.plan}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Status</span>
              <span className="font-semibold text-teal-800 uppercase text-xs">{sub.status}</span>
            </div>
            {sub.billing_cycle && (
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Cycle</span>
                <span className="capitalize text-slate-700">{sub.billing_cycle}</span>
              </div>
            )}
            {sub.renews_at && (
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Renews</span>
                <span className="text-slate-700">{new Date(sub.renews_at).toLocaleDateString()}</span>
              </div>
            )}

            <div className="pt-4 flex gap-3">
              {sub.status !== "cancelled" && (
                <button
                  onClick={cancel}
                  className="flex-1 rounded-xl border border-red-300 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  Cancel subscription
                </button>
              )}
              <button
                onClick={logout}
                className="flex-1 rounded-xl border border-slate-300 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
