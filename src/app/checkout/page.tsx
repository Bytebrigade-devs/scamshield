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
import { DEMO_MODE } from "@/lib/m2-mode";
import { readDemo } from "@/lib/demo-store";
import { TEST_CARDS, TEST_CARD_STARTING_BALANCES, type TestCardId } from "@/lib/test-cards";

function Checkout() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan"); const cycle = params.get("cycle");
  const [cardId, setCardId] = useState<TestCardId | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!DEMO_MODE) return;
    const demo = readDemo();
    if (demo.card) {
      setSaved(true);
      setCardId(demo.card.last4);
    }
  }, []);
  const [promo, setPromo] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !cardId) return;
    setError(""); setBusy(true);
    try {
      if (!DEMO_MODE && TEST_CARD_STARTING_BALANCES[cardId] < total) {
        throw new Error("Payment declined. This test card has insufficient balance.");
      }
      const payment = { plan, billingCycle: cycle, scenario: "success", promoCode: promo.trim().toUpperCase() };
      await subscriptionRequest("POST", DEMO_MODE
        ? { ...payment, testCardId: cardId }
        : { ...payment, paymentMethod: TEST_CARDS[cardId].method });
      router.push("/account/subscription?checkout=success");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Payment unavailable. Please retry."); }
    finally { setBusy(false); }
  }
  if (!isPlan(plan) || !isCycle(cycle)) return <main className="mx-auto max-w-md px-4 py-12"><Alert tone="warning">Select a plan and billing cycle first.</Alert><Link href="/pricing" className="link">View plans</Link></main>;
  const price = PLANS[plan].price[cycle];
  const discount = DEMO_MODE && promo.trim().toUpperCase() === "DEMO10" ? Math.round(price * 0.1) : 0;
  const total = price - discount;
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
    <Link href="/pricing" className="link text-sm">Back to plans</Link>
    <header className="mb-8 mt-6"><p className="font-medium text-primary">Subscription demo</p><h1 className="mt-2 text-[28px] font-bold">Complete your subscription</h1></header>
    <div className="grid items-start gap-6 md:grid-cols-2">
      <section aria-label="Order summary" className="space-y-5">
        <Card>
          <h2 className="text-lg font-semibold">Order summary</h2>
          <p className="mt-5 font-medium">{PLANS[plan].name} · {cycleLabel[cycle]}</p>
          <p className="tabular mt-2 text-[32px] font-bold">{money(PLANS[plan].price[cycle])}</p>
          <p className="mt-2 text-sm text-muted">
            {PLANS[plan].monthlyChecks} completed checks per month, up to {PLANS[plan].dailyChecks} per day.
            Your monthly allowance starts with your first check.
          </p>
          <p className="mt-5 border-t border-border-subtle pt-4 text-sm text-muted">One simulated payment. No automatic renewal.</p>
        </Card>
        <Alert tone="warning">Test checkout. Use dummy card details only. Payments are simulated; no money is charged.</Alert>
        <Link href="/login" className="link inline-block text-sm">Log in to your account</Link>
      </section>
      <Card className="p-6 sm:p-8">
        {!cardId ? <DemoCardForm onAdded={id => {
          setCardId(id);
          setSaved(DEMO_MODE && readDemo().card?.last4 === id);
          setError("");
        }}/> : <div>
          <h2 className="text-center text-xl font-semibold">Card verified</h2>
          <div role="status" className="mt-6 flex items-center gap-3 rounded-control bg-primary-subtle p-4">
            <PaymentCardIcon className="shrink-0 text-primary"/>
            <div><p className="font-medium">{TEST_CARDS[cardId].name} · Test card ending in {cardId}</p>
              {saved && <p className="text-sm text-muted">Saved dummy card</p>}
            </div>
          </div>
          <Button variant="text" disabled={busy} className="mt-2" onClick={() => setCardId(null)}>Change card</Button>
          <form onSubmit={pay} className="mt-4 space-y-5">
            <Field disabled={busy} label="Promo code (optional)" value={promo} onChange={e => setPromo(e.target.value)} maxLength={40} hint={DEMO_MODE ? "Try DEMO10 for a dummy 10% discount." : "No promo codes are available for test subscriptions."}/>
            {discount > 0 && <p role="status" className="text-sm text-success">DEMO10 applied: {money(discount)} off.</p>}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-4"><span className="font-medium">Demo total</span><span className="tabular font-semibold">{money(total)}</span></div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" block size="lg" className="rounded-full" loading={busy} loadingLabel="Verifying payment…">Verify payment</Button>
            <p className="text-center text-sm text-muted">No real payment will be taken.</p>
          </form>
        </div>}
      </Card>
    </div>
  </main>;
}
export default function CheckoutPage() { return <Suspense fallback={<p className="p-8" role="status">Loading checkout…</p>}><Checkout/></Suspense>; }
