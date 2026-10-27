import { PLANS, Subscription, isPlan } from "./plans";

/** Run on the server with its clock. M4 must also enforce atomic usage limits. */
export function evaluateEntitlement(sub: Subscription | null, now = Date.now()) {
  const expiry = sub?.renews_at ? Date.parse(sub.renews_at) : NaN;
  const plan = sub && isPlan(sub.plan) ? PLANS[sub.plan] : null;
  const validStatus = sub && ["trialing", "active", "cancelled"].includes(sub.status);
  const start = sub ? Date.parse(sub.started_at) : NaN;
  const allowed = Boolean(plan && validStatus && Number.isFinite(start) && start <= now && Number.isFinite(expiry) && expiry > now);
  return {
    canRunCheck: allowed,
    reason: allowed ? "valid_entitlement" : "subscription_required",
    planId: plan ? sub!.plan : null,
    status: sub?.status ?? null,
    expiresAt: sub?.renews_at ?? null,
    limits: allowed ? {
      monthlyChecks: sub!.billing_cycle === null ? 15 : plan!.monthlyChecks,
      dailyChecks: plan!.dailyChecks,
      trialTotalChecks: sub!.billing_cycle === null ? 15 : null,
      inputCharacters: 2000,
      checksPerMinute: 5,
    } : null,
  };
}

export function billingEnd(start: Date, months: number) {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end.toISOString();
}
