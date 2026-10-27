import { Subscription, isPlan, isCycle } from "./plans";
import { billingEnd, evaluateEntitlement } from "./entitlement";

export type DemoCard = { last4: "4242"; expiry: string };
type DemoState = {
  version: 1;
  user: { email: string; createdAt: string; signedIn: boolean };
  subscription: Subscription | null;
  card: DemoCard | null;
};
const KEY = "scamshield-interim-demo-v1";
function seed(): DemoState {
  const now = new Date();
  return { version: 1, user: { email: "demo@scamshield.test", createdAt: now.toISOString(), signedIn: true }, subscription: {
    user_id: "demo-user", plan: "guardian", billing_cycle: "monthly", status: "active", started_at: now.toISOString(), renews_at: billingEnd(now, 1), cancelled_at: null,
  }, card: null };
}
export function readDemo(): DemoState {
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    try { const state = JSON.parse(raw); if (state.version === 1 && typeof state.user?.email === "string") return state; } catch { /* Replace damaged demo data. */ }
  }
  const state = seed(); writeDemo(state); return state;
}
function writeDemo(state: DemoState) { window.localStorage.setItem(KEY, JSON.stringify(state)); }
export function demoSignIn(email: string, signup = false) {
  const state = signup ? seed() : readDemo();
  state.user = { email: email.trim(), createdAt: signup ? new Date().toISOString() : state.user.createdAt, signedIn: true };
  if (signup) { state.subscription = null; state.card = null; }
  writeDemo(state);
}
export function demoSignOut() { const state = readDemo(); state.user.signedIn = false; writeDemo(state); }
export function saveDemoCard(card: DemoCard | null) { const state = readDemo(); state.card = card; writeDemo(state); }
export function resetDemo(scenario: "new" | "active" | "trial" | "expired" = "new") {
  const state = seed();
  if (scenario === "new") state.subscription = null;
  if (scenario === "trial") state.subscription = { ...state.subscription!, plan: "sentinel", status: "trialing", billing_cycle: null, renews_at: new Date(Date.now() + 7 * 86400000).toISOString() };
  if (scenario === "expired") state.subscription = { ...state.subscription!, started_at: new Date(Date.now() - 32 * 86400000).toISOString(), renews_at: new Date(Date.now() - 86400000).toISOString() };
  writeDemo(state);
}

export function demoSubscriptionRequest(method: string, body?: unknown) {
  const state = readDemo();
  if (!state.user.signedIn) throw new Error("Please log in to continue the demo.");
  if (method === "DELETE") {
    if (!state.subscription) throw new Error("No subscription to cancel.");
    state.subscription = { ...state.subscription, status: "cancelled", cancelled_at: state.subscription.cancelled_at ?? new Date().toISOString() };
  } else if (method === "PUT") {
    if (state.subscription) throw new Error("This demo account already has a plan or trial. Use New account in Demo controls to present a fresh trial.");
    const start = new Date(state.user.createdAt);
    const expiry = new Date(start.getTime() + 7 * 86400000);
    if (expiry.getTime() <= Date.now()) throw new Error("The trial has expired. Choose a plan or reset the demo.");
    state.subscription = { user_id: "demo-user", plan: "sentinel", billing_cycle: null, status: "trialing", started_at: start.toISOString(), renews_at: expiry.toISOString(), cancelled_at: null };
  } else if (method === "POST") {
    const input = body as { plan?: unknown; billingCycle?: unknown; scenario?: unknown; promoCode?: unknown } | undefined;
    if (!input || !isPlan(input.plan) || !isCycle(input.billingCycle) || !["success", "declined"].includes(String(input.scenario))) throw new Error("Choose a valid plan, billing cycle and demo outcome.");
    if (input.scenario === "declined") throw new Error("Demo payment declined. Your subscription has not changed. Select Successful to try again.");
    if (input.promoCode && input.promoCode !== "DEMO10") throw new Error("Try the dummy promo code DEMO10 for 10% off.");
    const start = new Date();
    state.subscription = { user_id: "demo-user", plan: input.plan, billing_cycle: input.billingCycle, status: "active", started_at: start.toISOString(), renews_at: billingEnd(start, { monthly: 1, quarterly: 3, yearly: 12 }[input.billingCycle]), cancelled_at: null };
  } else if (method !== "GET") throw new Error("Unsupported demo action.");
  writeDemo(state);
  return { subscription: state.subscription, entitlement: evaluateEntitlement(state.subscription), mocked: true };
}
