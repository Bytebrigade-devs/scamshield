"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PLANS, isPlan, isCycle, cycleLabel, money } from "@/lib/plans";
import { subscriptionRequest } from "@/lib/subscription-client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Card";
import { PaymentCardIcon } from "@/components/ui/icons";
import { DemoCardForm } from "@/components/DemoCardForm";
import { readDemo } from "@/lib/demo-store";

function Checkout() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan"); const cycle = params.get("cycle");
  const [cardReady, setCardReady] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (readDemo().card) { setSaved(true); setCardReady(true); } }, []);
  const [scenario, setScenario] = useState("success");
  const [promo, setPromo] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !cardReady) return;
    setError(""); setBusy(true);
    // Frontend-only state update; no payment or account requests.
    try { await subscriptionRequest("POST", { plan, billingCycle: cycle, scenario, promoCode: promo.trim().toUpperCase() }); router.push("/account/subscription?checkout=success"); }
    catch (e) { setError(e instanceof Error ? e.message : "Payment unavailable. Please retry."); }
    finally { setBusy(false); }
  }
  if (!isPlan(plan) || !isCycle(cycle)) return <main className="mx-auto max-w-md px-4 py-12"><Alert tone="warning">Select a plan and billing cycle first.</Alert><Link href="/pricing" className="link">View plans</Link></main>;
  const price = PLANS[plan].price[cycle];
  const discount = promo.trim().toUpperCase() === "DEMO10" ? Math.round(price * 0.1) : 0;
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
    <Link href="/pricing" className="link text-sm">Back to plans</Link>
    <header className="mb-8 mt-6"><p className="font-medium text-primary">Subscription demo</p><h1 className="mt-2 text-[28px] font-bold">Complete your subscription</h1></header>
    <div className="grid items-start gap-6 md:grid-cols-2">
      <section aria-label="Order summary" className="space-y-5">
        <Card><h2 className="text-lg font-semibold">Order summary</h2><p className="mt-5 font-medium">{PLANS[plan].name} · {cycleLabel[cycle]}</p><p className="tabular mt-2 text-[32px] font-bold">{money(PLANS[plan].price[cycle])}</p><p className="mt-2 text-sm text-muted">{PLANS[plan].monthlyChecks} completed checks per month, up to {PLANS[plan].dailyChecks} per day.</p><p className="mt-5 border-t border-border-subtle pt-4 text-sm text-muted">One simulated payment. No automatic renewal.</p></Card>
        <Alert tone="warning">Frontend demo. Use dummy details only. No money is charged and no backend is connected.</Alert>
        <Link href="/login" className="link inline-block text-sm">Log in to your account</Link>
      </section>
      <Card className="p-6 sm:p-8">
        {!cardReady ? <DemoCardForm onAdded={() => { setCardReady(true); setSaved(Boolean(readDemo().card)); setError(""); }}/> : <div>
          <h2 className="text-center text-xl font-semibold">Your card is ready</h2>
          <div role="status" className="mt-6 flex items-center gap-3 rounded-control bg-primary-subtle p-4"><PaymentCardIcon className="text-primary"/><div><p className="font-medium">Demo card ending in 4242</p><p className="text-sm text-muted">{saved ? "Saved dummy card" : "For this checkout only"}</p></div></div>
          <Button variant="text" disabled={busy} className="mt-2" onClick={() => setCardReady(false)}>Change card</Button>
          <form onSubmit={pay} className="mt-4 space-y-5">
            <Field disabled={busy} label="Promo code (optional)" value={promo} onChange={e => setPromo(e.target.value)} maxLength={40} hint="Try DEMO10 for a dummy 10% discount."/>
            {discount > 0 && <p role="status" className="text-sm text-success">DEMO10 applied: {money(discount)} off.</p>}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-4"><span className="font-medium">Demo total</span><span className="tabular font-semibold">{money(price - discount)}</span></div>
            <details><summary className="cursor-pointer text-sm font-medium text-primary">Demo options</summary><div className="mt-4 space-y-4">
              <fieldset disabled={busy}><legend className="text-sm font-medium">Payment outcome</legend><div className="mt-2 flex flex-wrap gap-2">{["success", "declined"].map(value => <Button key={value} variant={scenario === value ? "primary" : "secondary"} aria-pressed={scenario === value} onClick={() => { setScenario(value); setError(""); }}>{value === "success" ? "Successful" : "Declined"}</Button>)}</div></fieldset>
            </div></details>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" block size="lg" className="rounded-full" loading={busy} loadingLabel="Processing simulation…">Simulate payment</Button>
            <p className="text-center text-sm text-muted">No real payment will be taken.</p>
          </form>
        </div>}
      </Card>
    </div>
  </main>;
}
export default function CheckoutPage() { return <Suspense fallback={<p className="p-8" role="status">Loading checkout…</p>}><Checkout/></Suspense>; }
