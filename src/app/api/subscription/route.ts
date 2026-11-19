import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionContext, subscriptionWriter } from "@/lib/subscription-server";
import { isPlan, isCycle } from "@/lib/plans";
import { isPaymentMethod } from "@/lib/payment-methods";
import { isTestCardId } from "@/lib/test-cards";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handle(req: NextRequest) {
  try {
    const context = await getSubscriptionContext(req);
    if (context.kind === "unauthenticated") return response({ error: "Log in to manage your subscription." }, 401);
    if (context.kind === "unavailable") return response({ error: "Unable to load subscription. Check the database setup." }, 503);
    const { user, subscription: current, entitlement } = context;
    if (req.method === "GET") return response({ subscription: current, entitlement, mocked: true });
    if (current?.status === "suspended" || current?.status === "past_due") return response({ error: "This account requires administrator review before subscription changes." }, 403);
    const db = subscriptionWriter();
    if (req.method === "DELETE") {
      if (!current) return response({ error: "No subscription to cancel." }, 409);
      if (current.status === "cancelled") return response({ subscription: current, mocked: true });
      const { data, error } = await db.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("user_id", user.id).eq("status", current.status).eq("started_at", current.started_at).select().single();
      if (error) throw new Error("Cancellation could not be saved. Refresh before retrying.");
      return response({ subscription: data, mocked: true });
    }
    if (req.method === "PUT") {
      if (current) return response({ error: "Your one-time trial has already been allocated. Choose a plan to continue." }, 409);
      // Anchor at registration; requesting it again cannot extend the trial.
      const start = new Date(user.created_at);
      const expiry = new Date(start.getTime() + 7 * 86400000);
      if (expiry.getTime() <= Date.now()) return response({ error: "Your trial period has ended. Choose a plan to continue." }, 409);
      const { data, error } = await db.from("subscriptions").insert({ user_id: user.id, plan: "sentinel", status: "trialing", billing_cycle: null, started_at: start.toISOString(), renews_at: expiry.toISOString(), cancelled_at: null }).select().single();
      if (error) return response({ error: "The trial could not be started. Refresh your subscription before retrying." }, 409);
      return response({ subscription: data, mocked: true });
    }
    const body = await req.json().catch(() => null);
    if (!body || !isPlan(body.plan) || !isCycle(body.billingCycle) || !["success", "declined"].includes(body.scenario)) return response({ error: "Choose a valid plan, billing cycle and mock payment outcome." }, 400);
    // Older clients identified only the synthetic debit/credit payment method.
    const paymentMethod = body.paymentMethod === undefined ? "debit_card" : body.paymentMethod;
    if (!isPaymentMethod(paymentMethod)) return response({ error: "Choose debit card or credit card for the payment simulation." }, 400);
    if (body.scenario === "declined") return response({ error: "Simulated payment declined. Your subscription has not changed." }, 402);
    if (typeof body.promoCode !== "undefined" && body.promoCode !== "") return response({ error: "No promo codes are available for this interim demo." }, 400);
    const cardId = body.testCardId === undefined ? (paymentMethod === "credit_card" ? "4444" : "4242") : body.testCardId;
    if (!isTestCardId(cardId)) return response({ error: "Choose a valid test card." }, 400);
    const requestId = body.requestId ?? randomUUID();
    if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      return response({ error: "Invalid payment request. Refresh and try again." }, 400);
    }
    const { data, error } = await db.rpc("m2_pay_test_subscription", {
      p_user_id: user.id, p_card_id: cardId, p_plan: body.plan,
      p_cycle: body.billingCycle, p_request_id: requestId,
    });
    if (error) throw error;
    switch (data?.kind) {
      case "paid": return response({ subscription: data.subscription, transactionId: data.transactionId, paymentMethod, mocked: true });
      case "declined": return response({ error: "Payment declined. This test card has insufficient balance." }, 402);
      case "blocked": return response({ error: "This account requires administrator review before subscription changes." }, 403);
      case "conflict": return response({ error: "This payment was already recorded or your subscription changed. Refresh to review your plan." }, 409);
      case "invalid": return response({ error: "Choose a valid test card, plan and billing cycle." }, 400);
      default: throw new Error("Payment could not be verified.");
    }
  } catch {
    return response({ error: "Subscription unavailable. Check the server configuration or retry." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
