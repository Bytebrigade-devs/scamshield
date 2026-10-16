"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { PLANS } from "@/lib/plans";

function Checkout() {
  const router = useRouter();
  const cycle = useSearchParams().get("cycle") === "yearly" ? "yearly" : "monthly";
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ billingCycle: cycle, cardNumber: card }),
    });
    if (res.ok) router.push("/account/subscription");
    else setError((await res.json()).error ?? "Payment failed");
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold">Mock checkout</h1>
      <p className="mt-1 text-sm text-slate-600">
        Premium ({cycle}) - ${PLANS.premium.price[cycle]}
      </p>
      <p className="mt-2 rounded bg-yellow-50 p-2 text-xs text-yellow-800">
        Demo only. No real payment is taken. Never enter a real card number.
      </p>
      <form onSubmit={pay} className="mt-4 space-y-4">
        <input
          value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric"
          placeholder="Test card number" className="w-full rounded border p-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50">
          {busy ? "Processing..." : "Pay (mock)"}
        </button>
      </form>
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
