export type BillingCycle = "monthly" | "yearly";

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    features: ["Digital Safety Score", "5 scam checks / month", "10 vault items"],
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: { monthly: 4.99, yearly: 49.99 },
    features: ["Everything in Free", "Unlimited AI scam checks", "Unlimited vault items", "Priority support"],
  },
} as const;

export interface Subscription {
  user_id: string;
  plan: "free" | "premium";
  status: "active" | "cancelled";
  billing_cycle: BillingCycle | null;
  started_at: string;
  renews_at: string | null;
  cancelled_at: string | null;
}
