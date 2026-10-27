import { NextRequest, NextResponse } from "next/server";
import { verifiedUser, subscriptionWriter } from "@/lib/subscription-server";
import { isPlan, isCycle, BillingCycle } from "@/lib/plans";
import { billingEnd, evaluateEntitlement } from "@/lib/entitlement";
import { isPaymentMethod } from "@/lib/payment-methods";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handle(req: NextRequest) {
  try {
    const auth = await verifiedUser(req);
    if (!auth) return response({ error: "Log in to manage your subscription." }, 401);
    const { data: current, error: readError } = await auth.db.from("subscriptions").select("*").eq("user_id", auth.user.id).maybeSingle();
    if (readError) return response({ error: "Unable to load subscription. Check the database setup." }, 503);
    if (req.method === "GET") return response({ subscription: current, entitlement: evaluateEntitlement(current), mocked: true });
    if (current?.status === "suspended" || current?.status === "past_due") return response({ error: "This account requires administrator review before subscription changes." }, 403);
    const db = subscriptionWriter();
    if (req.method === "DELETE") {
      if (!current) return response({ error: "No subscription to cancel." }, 409);
      if (current.status === "cancelled") return response({ subscription: current, mocked: true });
      const { data, error } = await db.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("user_id", auth.user.id).eq("status", current.status).eq("started_at", current.started_at).select().single();
      if (error) throw new Error("Cancellation could not be saved. Refresh before retrying.");
      return response({ subscription: data, mocked: true });
    }
    if (req.method === "PUT") {
      if (current) return response({ error: "Your one-time trial has already been allocated. Choose a plan to continue." }, 409);
      // Anchor at registration; requesting it again cannot extend the trial.
      const start = new Date(auth.user.created_at);
      const expiry = new Date(start.getTime() + 7 * 86400000);
      if (expiry.getTime() <= Date.now()) return response({ error: "Your trial period has ended. Choose a plan to continue." }, 409);
      const { data, error } = await db.from("subscriptions").insert({ user_id: auth.user.id, plan: "sentinel", status: "trialing", billing_cycle: null, started_at: start.toISOString(), renews_at: expiry.toISOString(), cancelled_at: null }).select().single();
      if (error) return response({ error: "The trial could not be started. Refresh your subscription before retrying." }, 409);
      return response({ subscription: data, mocked: true });
    }
    const body = await req.json().catch(() => null);
    if (!body || !isPlan(body.plan) || !isCycle(body.billingCycle) || !["success", "declined"].includes(body.scenario)) return response({ error: "Choose a valid plan, billing cycle and mock payment outcome." }, 400);
    // Missing method supports older demo clients. No method or card data is persisted.
    const paymentMethod = body.paymentMethod === undefined ? "debit_card" : body.paymentMethod;
    if (!isPaymentMethod(paymentMethod)) return response({ error: "Choose debit card or credit card for the payment simulation." }, 400);
    if (body.scenario === "declined") return response({ error: "Simulated payment declined. Your subscription has not changed." }, 402);
    if (typeof body.promoCode !== "undefined" && body.promoCode !== "") return response({ error: "No promo codes are available for this interim demo." }, 400);
    if (current?.billing_cycle && evaluateEntitlement(current).canRunCheck) return response({ error: "An entitlement is already valid. Plan changes are planned for a later stage." }, 409);
    const start = new Date();
    const cycle: BillingCycle = body.billingCycle;
    const values = { user_id: auth.user.id, plan: body.plan, status: "active", billing_cycle: cycle, started_at: start.toISOString(), renews_at: billingEnd(start, { monthly: 1, quarterly: 3, yearly: 12 }[cycle]), cancelled_at: null };
    // Compare previous state to prevent a concurrent request overwriting new access or suspension.
    let query;
    if (current) {
      query = db.from("subscriptions").update(values).eq("user_id", auth.user.id).eq("status", current.status).eq("started_at", current.started_at);
      query = current.renews_at ? query.eq("renews_at", current.renews_at) : query.is("renews_at", null);
    } else query = db.from("subscriptions").insert(values);
    const { data, error } = await query.select().single();
    if (error) return response({ error: "Subscription changed or could not be saved. Refresh before retrying." }, 409);
    return response({ subscription: data, paymentMethod, mocked: true });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Subscription unavailable. Please retry." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
