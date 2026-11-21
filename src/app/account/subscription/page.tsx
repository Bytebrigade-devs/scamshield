"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demoSignOut, readDemo, resetDemo } from "@/lib/demo-store";
import { subscriptionRequest } from "@/lib/subscription-client";
import { Subscription, PLANS, cycleLabel } from "@/lib/plans";
import { evaluateEntitlement } from "@/lib/entitlement";
import { Button, buttonClass } from "@/components/ui/Button";
import { Alert, Card } from "@/components/ui/Card";
import { DEMO_MODE } from "@/lib/m2-mode";
import { CheckUsage } from "@/components/CheckUsage";
import { getSupabase } from "@/lib/supabase";

type Entitlement = ReturnType<typeof evaluateEntitlement>;

export default function SubscriptionPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [access, setAccess] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [email, setEmail] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const load = useCallback(async () => {
    setError("");
    try {
      const json = await subscriptionRequest();
      setSub(json.subscription);
      setAccess(json.entitlement ?? null);
      if (DEMO_MODE) {
        const demo = readDemo();
        setEmail(demo.user.email);
      } else {
        const { data, error } = await getSupabase().auth.getUser();
        if (error) throw error;
        setEmail(data.user?.email ?? "");
      }
    }
    catch (e) { setError(e instanceof Error ? e.message : "Subscription unavailable."); setAccess(null); setSub(null); setEmail(""); }
    finally { setLoading(false); setNowMs(Date.now()); }
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the loader and the query-param notice both need browser APIs, so they can only run after mount. */
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") setInfo("Simulated payment successful. Your subscription is now active.");
    if (params.get("trialEmail") === "sent") setInfo("Your 7-day trial is active. A confirmation with your expiry date and check limits was sent to your account email.");
    if (params.get("trialEmail") === "unavailable") setInfo("Your 7-day trial is active, but the confirmation email could not be sent. Configure the email sender to enable delivery.");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);
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
    try { if (DEMO_MODE) demoSignOut(); else { const { error } = await getSupabase().auth.signOut(); if (error) throw error; } router.push("/login"); }
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
    {email && <p className="mt-2 text-sm text-muted">Account: {email}</p>}
    {error && <Alert tone="danger" className="mt-4">{error} <Link className="link" href="/login">Log in</Link> <Button variant="text" onClick={() => void load()}>Retry</Button></Alert>}
    {info && <Alert tone="success" className="mt-4">{info}</Alert>}
    {!error && !sub && <Card className="mt-6"><h2 className="text-xl font-semibold">Choose how to get started</h2><p className="mt-2 text-muted">Start your one-time trial or select a mock subscription.</p><Link href="/pricing" className={buttonClass({ className: "mt-4" })}>Choose a plan</Link></Card>}
    {sub && <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{PLANS[sub.plan]?.name ?? "Unknown"}{sub.billing_cycle === null ? " trial" : " plan"}</h2><span className="rounded-full bg-primary-subtle px-3 py-1 text-sm font-medium capitalize">{sub.renews_at && Date.parse(sub.renews_at) <= nowMs ? "expired" : sub.status}</span></div>
      <dl className="mt-4 divide-y divide-border-subtle">
        <Row label="Billing" value={sub.billing_cycle ? `${cycleLabel[sub.billing_cycle]} (mock)` : "No billing · one-time trial"}/>
        <Row label="Started" value={fmt(sub.started_at)}/>
        {sub.renews_at && <Row label="Access expires (Sri Lanka time)" value={fmt(sub.renews_at)}/>}
        {sub.cancelled_at && <Row label="Cancelled" value={fmt(sub.cancelled_at)}/>}
      </dl>
      {access && <Alert tone={access.canRunCheck ? "success" : "warning"} className="mt-4">{access.canRunCheck ? "Your checking access is active." : "Checking access is unavailable. Review your status or choose a plan."}</Alert>}
      {!DEMO_MODE && access?.limits && (
        <section className="mt-5" aria-labelledby="check-allowance-heading">
          <h3 id="check-allowance-heading" className="font-semibold">Check allowance</h3>
          <p className="mt-1 text-sm text-muted">
            {access.limits.trialTotalChecks === null
              ? `${access.limits.monthlyChecks} completed checks per month`
              : `${access.limits.trialTotalChecks} completed checks during your trial`}
            {", up to "}{access.limits.dailyChecks} per day.
            {access.limits.trialTotalChecks === null && " Your monthly allowance starts with your first check."}
          </p>
        </section>
      )}
      {!DEMO_MODE && <CheckUsage />}
      {DEMO_MODE && access?.limits && <div className="mt-5"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{sub.billing_cycle ? "Monthly usage" : "Trial usage"} (dummy data)</span><span className="tabular">{sub.billing_cycle ? 17 : 3} / {access.limits.monthlyChecks} checks</span></div><div role="progressbar" aria-label="Demo checks used" aria-valuemin={0} aria-valuemax={access.limits.monthlyChecks} aria-valuenow={sub.billing_cycle ? 17 : 3} className="mt-2 h-2 overflow-hidden rounded-full bg-primary-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${100 * (sub.billing_cycle ? 17 : 3) / access.limits.monthlyChecks}%` }}/></div><p className="mt-2 text-sm text-muted">2 of {access.limits.dailyChecks} daily checks used. Sample counters for presentation.</p></div>}
      <div className="mt-6 flex flex-wrap gap-3">
        {DEMO_MODE && access?.canRunCheck && <Link href="/pricing" className={buttonClass({ variant: "secondary" })}>Change plan</Link>}
        {sub.status !== "cancelled" && access?.canRunCheck && <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancel {sub.billing_cycle ? "subscription" : "trial"}</Button>}
        {!access?.canRunCheck && sub.status !== "suspended" && sub.status !== "past_due" && <Link href="/pricing" className={buttonClass()}>Choose a plan</Link>}
      </div>
      {confirmCancel && <div className="mt-4 rounded-control border border-border-subtle p-4"><p>Cancel this entitlement? Access will continue until the expiry shown above. No refund or real payment occurs.</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="danger" loading={busy} loadingLabel="Cancelling…" onClick={cancel}>Confirm cancellation</Button><Button variant="text" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep plan</Button></div></div>}
    </Card>}
    {DEMO_MODE && <details className="mt-6 rounded-card border border-border-subtle bg-surface p-5"><summary className="cursor-pointer font-semibold text-primary">Demo controls</summary><p className="mt-3 text-sm text-muted">Load a sample scenario for your presentation. New account clears the dummy plan so you can repeat signup, trial and payment.</p><div className="mt-4 flex flex-wrap gap-2">{([['new', 'New account'], ['active', 'Active plan'], ['trial', 'Trial account'], ['expired', 'Expired plan']] as const).map(([scenario, label]) => <Button key={scenario} variant="secondary" disabled={busy} onClick={() => void showScenario(scenario)}>{label}</Button>)}</div></details>}
    <Button variant="text" className="mt-6" disabled={busy} onClick={logout}>Log out</Button>
  </main>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="text-muted">{label}</dt><dd className="tabular font-medium">{value}</dd></div>; }
