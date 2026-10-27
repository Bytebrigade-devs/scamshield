export type BillingCycle = "monthly" | "quarterly" | "yearly";
export type PlanId = "sentinel" | "guardian" | "aegis";
export const PLANS = {
  sentinel: { id: "sentinel", name: "Sentinel", price: { monthly: 490, quarterly: 1320, yearly: 4900 }, monthlyChecks: 60, dailyChecks: 5 },
  guardian: { id: "guardian", name: "Guardian", price: { monthly: 990, quarterly: 2670, yearly: 9900 }, monthlyChecks: 200, dailyChecks: 15 },
  aegis: { id: "aegis", name: "Aegis", price: { monthly: 1990, quarterly: 5370, yearly: 19900 }, monthlyChecks: 600, dailyChecks: 40 },
} as const;
export const money = (amount: number) => `LKR ${amount.toLocaleString("en-LK")}`;
export const cycleLabel = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Annual" };
export function isPlan(value: unknown): value is PlanId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}
export function isCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "quarterly" || value === "yearly";
}
export interface Subscription {
  user_id: string;
  plan: PlanId;
  status: "trialing" | "active" | "cancelled" | "past_due" | "suspended";
  billing_cycle: BillingCycle | null;
  started_at: string;
  renews_at: string | null;
  cancelled_at: string | null;
}
