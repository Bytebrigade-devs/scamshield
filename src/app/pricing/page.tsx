"use client";
import { DEMO_MODE } from "@/lib/m2-mode";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHECK_LIMITS, PLANS, BillingCycle, money, cycleLabel } from "@/lib/plans";
import { subscriptionRequest } from "@/lib/subscription-client";
import { checkoutPath } from "@/lib/checkout-path";
import { Button, buttonClass } from "@/components/ui/Button";
import { Alert, Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";

export default function PricingPage() {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function startTrial() {
    setBusy(true); setError("");
    try {
      const result = await subscriptionRequest("PUT");
      router.push(DEMO_MODE ? "/account/subscription" : `/account/subscription?trialEmail=${result.emailSent ? "sent" : "unavailable"}`);
    }
    catch (e) { setError(e instanceof Error ? e.message : "Trial unavailable. Please retry."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
    <Link className="link text-sm" href="/">ScamShield home</Link>
    <header className="mt-6 text-center">
      <p className="font-medium text-primary">Plans for your everyday digital safety</p>
      <h1 className="mt-3 text-[28px] font-bold leading-tight sm:text-[36px]">Choose the checking capacity you need</h1>
      <p className="mx-auto mt-3 max-w-2xl text-muted">Every plan includes the same verdict, red flags, explanation and guidance. Plans differ in check limits, never assessment quality.</p>
    </header>
    <div role="group" aria-label="Billing cycle" className="mx-auto mt-8 flex w-fit flex-wrap gap-1 rounded-control border border-border-subtle bg-surface p-1">
      {(["monthly", "quarterly", "yearly"] as const).map(c => <Button key={c} variant={cycle === c ? "primary" : "text"} aria-pressed={cycle === c} onClick={() => setCycle(c)}>{cycleLabel[c]}</Button>)}
    </div>
    <p className="mt-3 text-center text-sm text-muted">Quarterly prices include a discount. Annual plans cost the price of 10 months.</p>
    <div className="mt-8 grid gap-6 md:grid-cols-3">
      {Object.values(PLANS).map(plan => <Card as="section" key={plan.id} className={`flex flex-col ${plan.id === "guardian" ? "border-primary" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{plan.name}</h2>{plan.id === "guardian" && <span className="rounded-full bg-primary-subtle px-3 py-1 text-sm text-primary">Recommended</span>}</div>
        <p className="tabular mt-6 text-[32px] font-bold text-brand">{money(plan.price[cycle])}</p>
        <p className="text-sm text-muted">per {cycle === "monthly" ? "month" : cycle === "quarterly" ? "3 months" : "year"} · simulated billing</p>
        <ul className="my-6 flex-1 space-y-3">{[`${plan.monthlyChecks} completed checks per month`, `Up to ${plan.dailyChecks} completed checks per day`].map(feature => <li key={feature} className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary"/><span>{feature}</span></li>)}</ul>
        <Link href={checkoutPath(plan.id, cycle) ?? "/pricing"} className={buttonClass({ variant: plan.id === "guardian" ? "primary" : "secondary", size: "lg" })}>Choose {plan.name}</Link>
      </Card>)}
    </div>
    <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted">
      Your monthly allowance starts with your first check and counts only successful checks.
      Each check supports up to {CHECK_LIMITS.inputCharacters.toLocaleString("en-LK")} characters.
      You can submit up to {CHECK_LIMITS.checksPerMinute} checks per minute.
    </p>
    <Card className="mt-8 flex flex-wrap items-center justify-between gap-6">
      <div><h2 className="text-xl font-semibold">Try ScamShield for 7 days</h2><p className="mt-2 text-muted">{CHECK_LIMITS.trialTotalChecks} checks total, up to {PLANS.sentinel.dailyChecks} per day. One trial per registered account, from signup. No card details.</p></div>
      <Button onClick={startTrial} loading={busy} loadingLabel="Starting trial…">Start my trial</Button>
    </Card>
    {error && <Alert tone="danger" className="mt-4">{error} <Link href="/login" className="link">Log in</Link></Alert>}
    <p className="mt-6 text-center text-sm text-muted">{DEMO_MODE ? "All payments and accounts use dummy data." : "Payments are simulated. Accounts and subscriptions are saved securely."} There is no ongoing free tier.</p>
    {DEMO_MODE && <p className="mt-2 text-center text-sm text-muted">Add a dummy card at checkout. Use DEMO10 to preview a 10% discount.</p>}
    <p className="mt-3 text-center text-sm"><Link className="link" href="/account/subscription">Manage subscription</Link></p>
  </main>;
}
