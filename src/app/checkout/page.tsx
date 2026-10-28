"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { PLANS, PlanId } from "@/lib/plans";

function Checkout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPlan = searchParams.get("plan");
  const planId: PlanId = rawPlan === "Aegis" || rawPlan === "Sentinel" ? rawPlan : "Guardian";
  const cycle = searchParams.get("cycle") === "yearly" ? "yearly" : "monthly";

  const plan = PLANS[planId];
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) return router.push("/login");

    const res = await fetch("/api/subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        plan: planId,
        billingCycle: cycle,
        cardNumber: card,
      }),
    });

    if (res.ok) {
      router.push("/account/subscription");
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Payment verification failed");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Mock Checkout</h1>
        <p className="mt-1 text-sm text-slate-600">
          Plan: <strong>{plan.name}</strong> ({cycle}) —{" "}
          <span className="font-semibold text-teal-800">
            LKR {plan.priceLKR[cycle].toLocaleString()}
          </span>
        </p>

        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
          <strong>Academic & Demonstration Preview:</strong> Payments are completely simulated. No money is charged, no gateway is contacted, and real card details must never be entered.
        </div>

        <form onSubmit={pay} className="mt-5 space-y-4">
          <div>
            <label htmlFor="card-input" className="block text-xs font-semibold text-slate-700 mb-1">
              Test Card Number (Synthetic 16 digits)
            </label>
            <input
              id="card-input"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              inputMode="numeric"
              placeholder="4242 4242 4242 4242"
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:border-teal-600"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition shadow-sm"
          >
            {busy ? "Activating plan..." : `Confirm ${plan.name} Subscription (Mock)`}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <Checkout />
    </Suspense>
  );
}
