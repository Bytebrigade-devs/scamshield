export type BillingCycle = "monthly" | "yearly";

export type PlanId = "Sentinel" | "Guardian" | "Aegis";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceLKR: { monthly: number; yearly: number };
  scamChecksMonthly: number;
  scamChecksDaily: number;
  vaultItems: number;
  charCap: number;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  Sentinel: {
    id: "Sentinel",
    name: "Sentinel",
    priceLKR: { monthly: 490, yearly: 4900 },
    scamChecksMonthly: 60,
    scamChecksDaily: 5,
    vaultItems: 50,
    charCap: 2000,
    features: [
      "60 AI scam checks / month (5/day)",
      "50 password vault items",
      "2,000-character input cap",
      "Digital Safety Score view",
    ],
  },
  Guardian: {
    id: "Guardian",
    name: "Guardian",
    priceLKR: { monthly: 990, yearly: 9900 },
    scamChecksMonthly: 200,
    scamChecksDaily: 15,
    vaultItems: 250,
    charCap: 2000,
    features: [
      "200 AI scam checks / month (15/day)",
      "250 password vault items",
      "2,000-character input cap",
      "Priority triage in support queue",
      "Full Digital Safety Score indicators",
    ],
  },
  Aegis: {
    id: "Aegis",
    name: "Aegis",
    priceLKR: { monthly: 1990, yearly: 19900 },
    scamChecksMonthly: 600,
    scamChecksDaily: 40,
    vaultItems: 1000,
    charCap: 2000,
    features: [
      "600 AI scam checks / month (40/day)",
      "1,000 password vault items",
      "2,000-character input cap",
      "Comprehensive threat monitoring feed",
      "Priority customer assistance",
    ],
  },
} as const;

export interface Subscription {
  user_id: string;
  plan: PlanId;
  status: "active" | "trialing" | "cancelled";
  billing_cycle: BillingCycle | null;
  started_at: string;
  renews_at: string | null;
  cancelled_at: string | null;
}
