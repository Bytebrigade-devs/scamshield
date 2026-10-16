"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { PLANS, BillingCycle } from "@/lib/plans";

export default function PricingPage() {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [error, setError] = useState<string | null>(null);

  async function chooseFree() {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) return router.push("/signup");
    const res = await fetch("/api/subscription", {
      method: "PUT",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (res.ok) router.push("/account/subscription");
    else setError((await res.json()).error ?? "Something went wrong");
  }

  async function choosePremium() {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) return router.push("/signup");
    router.push(`/checkout?cycle=${cycle}`);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-center text-3xl font-bold">Choose your plan</h1>
      <div className="mt-4 flex justify-center gap-2">
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c} onClick={() => setCycle(c)}
            className={`rounded px-3 py-1 text-sm ${cycle === c ? "bg-blue-600 text-white" : "border"}`}
          >
            {c === "monthly" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {Object.values(PLANS).map((p) => (
          <section key={p.id} className="rounded-lg border bg-white p-6">
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <p className="mt-2 text-3xl font-bold">
              ${p.price[cycle]}
              <span className="text-sm font-normal text-slate-500">/{cycle === "monthly" ? "mo" : "yr"}</span>
            </p>
            <ul className="mt-4 space-y-1 text-sm text-slate-700">
              {p.features.map((f) => <li key={f}>✓ {f}</li>)}
            </ul>
            <button
              onClick={p.id === "free" ? chooseFree : choosePremium}
              className="mt-6 w-full rounded bg-blue-600 p-2 text-white"
            >
              {p.id === "free" ? "Continue with Free" : "Go Premium"}
            </button>
          </section>
        ))}
      </div>
      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      <p className="mt-6 text-center text-xs text-slate-500">
        Demo only: payments are mocked. <Link href="/" className="underline">Home</Link>
      </p>
    </main>
  );
}
