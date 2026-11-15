"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PLANS, BillingCycle, PlanId } from "@/lib/plans";

export default function PricingPage() {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  function choosePlan(planId: PlanId) {
    router.push(`/checkout?plan=${planId}&cycle=${cycle}`);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Choose your ScamShield plan</h1>
        <p className="mt-2 text-sm text-slate-600">
          All subscription plans use simulated mock billing (LKR). Bounded quotas enforce responsible resource access.
        </p>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCycle(c)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              cycle === c
                ? "bg-teal-700 text-white shadow-sm"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {c === "monthly" ? "Monthly billing" : "Yearly billing (Save 2 months)"}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {Object.values(PLANS).map((p) => {
          const isFeatured = p.id === "Guardian";
          const price = p.priceLKR[cycle];
          return (
            <section
              key={p.id}
              className={`rounded-2xl border bg-white p-6 shadow-sm flex flex-col justify-between ${
                isFeatured ? "border-teal-600 ring-2 ring-teal-600/20" : "border-slate-200"
              }`}
            >
              <div>
                {isFeatured && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200 mb-3">
                    Most Popular
                  </span>
                )}
                <h2 className="text-xl font-bold text-slate-900">{p.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-slate-500">LKR</span>
                  <span className="text-3xl font-extrabold text-slate-900">
                    {price.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">
                    /{cycle === "monthly" ? "mo" : "yr"}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 text-xs font-medium text-slate-700 space-y-1">
                  <div>• {p.scamChecksMonthly} checks / month ({p.scamChecksDaily}/day)</div>
                  <div>• {p.vaultItems} vault items</div>
                  <div>• {p.charCap.toLocaleString()} character input limit</div>
                </div>

                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <span className="text-teal-700 font-bold">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => choosePlan(p.id)}
                className={`mt-6 w-full rounded-xl py-2.5 text-xs font-semibold transition ${
                  isFeatured
                    ? "bg-teal-700 text-white hover:bg-teal-800"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Select {p.name} (Mock)
              </button>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Demo only: mock subscription billing. No credit card or real financial details are processed.{" "}
        <Link href="/" className="text-teal-700 underline">
          Return home
        </Link>
      </p>
    </main>
  );
}
