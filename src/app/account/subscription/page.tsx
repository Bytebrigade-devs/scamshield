"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demoSignOut, readDemo, resetDemo, saveDemoCard, DemoCard } from "@/lib/demo-store";
import { subscriptionRequest } from "@/lib/subscription-client";
import { Subscription, PLANS, cycleLabel } from "@/lib/plans";
import { evaluateEntitlement } from "@/lib/entitlement";
import { Button, buttonClass } from "@/components/ui/Button";
import { Alert, Card } from "@/components/ui/Card";
type Entitlement = ReturnType<typeof evaluateEntitlement>;

export default function SubscriptionPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [access, setAccess] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [email, setEmail] = useState("");
  const [card, setCard] = useState<DemoCard | null>(null);
  const load = useCallback(async () => {
    setError("");
    try { const json = await subscriptionRequest(); setSub(json.subscription); setAccess(json.entitlement); const demo = readDemo(); setEmail(demo.user.email); setCard(demo.card); }
    catch (e) { setError(e instanceof Error ? e.message : "Subscription unavailable."); setAccess(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); if (new URLSearchParams(window.location.search).get("checkout") === "success") setInfo("Demo payment successful. Your subscription is now active."); }, [load]);
  // Keep the frontend demo in sync when its simulated access period ends.
  useEffect(() => {
    if (!access?.canRunCheck || !access.expiresAt) return;
    const delay = Date.parse(access.expiresAt) - Date.now();
    const timer = setTimeout(() => void load(), Math.min(Math.max(delay + 100, 100), 2147483647));
    return () => clearTimeout(timer);
  }, [access, load]);
  async function cancel() {
    setBusy(true); setError("");
    try { await subscriptionRequest("DELETE"); setConfirmCancel(false); setInfo("Cancellation saved. Existing access continues until its expiry."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Cancellation failed."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { demoSignOut(); router.push("/login"); }
    catch { setError("Unable to log out. Please retry."); }
    finally { setBusy(false); }
  }
  async function showScenario(scenario: "new" | "active" | "trial" | "expired") {
    setBusy(true); setConfirmCancel(false);
    try { resetDemo(scenario); setInfo("Demo scenario loaded."); await load(); }
    finally { setBusy(false); }
  }
  const fmt = (value: string) => new Date(value).toLocaleString("en-LK", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" });
  if (loading) return <main className="flex min-h-screen items-center justify-center gap-3" role="status"><span className="spinner"/>Loading subscription…</main>;
  return <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
    <Link href="/pricing" className="link">View plans</Link><h1 className="mt-6 text-[28px] font-bold">Your subscription</h1>
    <p className="mt-2 text-muted">Manage your simulated plan and checking access.</p>
    {email && <p className="mt-2 text-sm text-muted">Demo account: {email}</p>}
    {error && <Alert tone="danger" className="mt-4">{error} <Link className="link" href="/login">Log in</Link> <Button variant="text" onClick={() => void load()}>Retry</Button></Alert>}
    {info && <Alert tone="success" className="mt-4">{info}</Alert>}
    {!error && !sub && <Card className="mt-6"><h2 className="text-xl font-semibold">Choose how to get started</h2><p className="mt-2 text-muted">Start your one-time trial or select a mock subscription.</p><Link href="/pricing" className={buttonClass({ className: "mt-4" })}>Choose a plan</Link></Card>}
    {sub && <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{PLANS[sub.plan]?.name ?? "Unknown"}{sub.billing_cycle === null ? " trial" : " plan"}</h2><span className="rounded-full bg-primary-subtle px-3 py-1 text-sm font-medium capitalize">{sub.renews_at && Date.parse(sub.renews_at) <= Date.now() ? "expired" : sub.status}</span></div>
      <dl className="mt-4 divide-y divide-border-subtle">
        <Row label="Billing" value={sub.billing_cycle ? `${cycleLabel[sub.billing_cycle]} (mock)` : "No billing · one-time trial"}/>
        <Row label="Started" value={fmt(sub.started_at)}/>
        {sub.renews_at && <Row label="Access expires (Sri Lanka time)" value={fmt(sub.renews_at)}/>}
        {sub.cancelled_at && <Row label="Cancelled" value={fmt(sub.cancelled_at)}/>}
      </dl>
      {access && <Alert tone={access.canRunCheck ? "success" : "warning"} className="mt-4">{access.canRunCheck ? "Your demo checking access is active." : "Your demo access has expired. Choose a plan to continue."}</Alert>}
      {access?.limits && <div className="mt-5"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{sub.billing_cycle ? "Monthly usage" : "Trial usage"} (dummy data)</span><span className="tabular">{sub.billing_cycle ? 17 : 3} / {access.limits.monthlyChecks} checks</span></div><div role="progressbar" aria-label="Demo checks used" aria-valuemin={0} aria-valuemax={access.limits.monthlyChecks} aria-valuenow={sub.billing_cycle ? 17 : 3} className="mt-2 h-2 overflow-hidden rounded-full bg-primary-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${100 * (sub.billing_cycle ? 17 : 3) / access.limits.monthlyChecks}%` }}/></div><p className="mt-2 text-sm text-muted">2 of {access.limits.dailyChecks} daily checks used. Sample counters for presentation.</p></div>}
      <div className="mt-6 flex flex-wrap gap-3">
        {access?.canRunCheck && <Link href="/pricing" className={buttonClass({ variant: "secondary" })}>Change plan</Link>}
        {sub.status !== "cancelled" && access?.canRunCheck && <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancel {sub.billing_cycle ? "subscription" : "trial"}</Button>}
        {!access?.canRunCheck && sub.status !== "suspended" && sub.status !== "past_due" && <Link href="/pricing" className={buttonClass()}>Choose a plan</Link>}
      </div>
      {confirmCancel && <div className="mt-4 rounded-control border border-border-subtle p-4"><p>Cancel this entitlement? Access will continue until the expiry shown above. No refund or real payment occurs.</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="danger" loading={busy} loadingLabel="Cancelling…" onClick={cancel}>Confirm cancellation</Button><Button variant="text" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep plan</Button></div></div>}
    </Card>}
    <Card className="mt-6"><h2 className="text-xl font-semibold">Payment method</h2>{card ? <div className="mt-4"><p className="font-medium">Demo card ending in {card.last4}</p><p className="mt-1 text-sm text-muted">Expires {card.expiry} · dummy card saved in this browser</p><Button className="mt-3" variant="text" onClick={() => { saveDemoCard(null); setCard(null); setInfo("Saved dummy card removed."); }}>Remove card</Button></div> : <p className="mt-3 text-muted">No saved dummy card. Add one during checkout and select Save my card.</p>}<Link href="/checkout?plan=guardian&cycle=monthly" className="link mt-3 inline-block">{card ? "Update demo card" : "Add demo card"}</Link></Card>
    <details className="mt-6 rounded-card border border-border-subtle bg-surface p-5"><summary className="cursor-pointer font-semibold text-primary">Demo controls</summary><p className="mt-3 text-sm text-muted">Load a sample scenario for your presentation. New account clears the dummy plan and saved card so you can repeat signup, trial and payment.</p><div className="mt-4 flex flex-wrap gap-2">{([['new', 'New account'], ['active', 'Active plan'], ['trial', 'Trial account'], ['expired', 'Expired plan']] as const).map(([scenario, label]) => <Button key={scenario} variant="secondary" disabled={busy} onClick={() => void showScenario(scenario)}>{label}</Button>)}</div></details>
    <Button variant="text" className="mt-6" disabled={busy} onClick={logout}>Log out</Button>
  </main>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="text-muted">{label}</dt><dd className="tabular font-medium">{value}</dd></div>; }
