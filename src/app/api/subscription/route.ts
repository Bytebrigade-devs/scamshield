import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionContext, subscriptionWriter } from "@/lib/subscription-server";
import { isPlan, isCycle, BillingCycle, PLANS, type PlanId } from "@/lib/plans";
import { billingEnd } from "@/lib/entitlement";
import { isPaymentMethod } from "@/lib/payment-methods";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Columns added by docs/m2-billing-schema-draft.sql; absent until the steward applies it. */
const BILLING_COLUMNS = ["price_lkr", "currency", "payment_method", "auto_renew"] as const;

/**
 * True only when Postgres reports the billing columns (42703) or the ledger table (42P01) as
 * missing, i.e. the draft has not been applied to this database. A concurrency or validation
 * failure must NOT match, or a real 409 would be silently downgraded to a partial write.
 */
function isMissingBillingSchema(error: unknown): boolean {
  const failure = error as { code?: string | null; message?: string | null } | null;
  const code = failure?.code ?? null;
  if (code === "42703" || code === "42P01") return true;
  const message = (failure?.message ?? "").toLowerCase();
  return message.includes("does not exist") && BILLING_COLUMNS.some((column) => message.includes(column));
}

async function sendTrialEmail(email: string, expiresAt: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRIAL_EMAIL_FROM;
  if (!apiKey || !from) return false;

  const expiry = new Date(expiresAt).toLocaleString("en-LK", {
    timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short",
  });
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your ScamShield 7-day trial has started",
        text: `Your ScamShield trial is active. It expires on ${expiry} (Sri Lanka time). Your trial includes 15 checks total, with up to 5 checks per day. No card details are required.`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return result.ok;
  } catch {
    return false;
  }
}

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
      const emailSent = user.email ? await sendTrialEmail(user.email, data.renews_at) : false;
      return response({ subscription: data, emailSent, mocked: true });
    }
    const body = await req.json().catch(() => null);
    if (!body || !isPlan(body.plan) || !isCycle(body.billingCycle) || !["success", "declined"].includes(body.scenario)) return response({ error: "Choose a valid plan, billing cycle and mock payment outcome." }, 400);
    // Missing method supports older demo clients. No method or card data is persisted.
    const paymentMethod = body.paymentMethod === undefined ? "debit_card" : body.paymentMethod;
    if (!isPaymentMethod(paymentMethod)) return response({ error: "Choose debit card or credit card for the payment simulation." }, 400);
    if (body.scenario === "declined") return response({ error: "Simulated payment declined. Your subscription has not changed." }, 402);
    if (typeof body.promoCode !== "undefined" && body.promoCode !== "") return response({ error: "No promo codes are available for this interim demo." }, 400);
    if (current?.billing_cycle && entitlement.canRunCheck) return response({ error: "An entitlement is already valid. Plan changes are planned for a later stage." }, 409);
    const start = new Date();
    const cycle: BillingCycle = body.billingCycle;
    // Price is resolved server-side from the plan table, never from the request body.
    const plan = body.plan as PlanId;
    const priceLkr = PLANS[plan].price[cycle];
    // `isPlan(body.plan)` above already narrowed this; the cast adds no authority.
    const accessValues = {
      user_id: user.id, plan, status: "active", billing_cycle: cycle,
      started_at: start.toISOString(), renews_at: billingEnd(start, { monthly: 1, quarterly: 3, yearly: 12 }[cycle]),
      cancelled_at: null,
    };
    const billingValues = { price_lkr: priceLkr, currency: "LKR", payment_method: paymentMethod, auto_renew: false };
    // Compare previous state to prevent a concurrent request overwriting new access or suspension.
    const writeSubscription = (values: Record<string, unknown>) => {
      if (current) {
        let query = db.from("subscriptions").update(values).eq("user_id", user.id).eq("status", current.status).eq("started_at", current.started_at);
        query = current.renews_at ? query.eq("renews_at", current.renews_at) : query.is("renews_at", null);
        return query.select().single();
      }
      return db.from("subscriptions").insert(values).select().single();
    };
    // One atomic write carrying the billing columns, so a charged row can never exist without its
    // price and method (the draft's all-or-nothing CHECK). If the draft has not been applied, the
    // missing columns must cost the metadata only — never the checkout (review item 1, 21 Nov 2026).
    let { data, error } = await writeSubscription({ ...accessValues, ...billingValues });
    let billingRecorded = !error;
    if (error && isMissingBillingSchema(error)) {
      const fallback = await writeSubscription(accessValues);
      data = fallback.data;
      error = fallback.error;
      billingRecorded = false;
    }
    if (error) return response({ error: "Subscription changed or could not be saved. Refresh before retrying." }, 409);
    // Historise the simulated charge so the amount survives later price changes. A ledger failure
    // must not grant or revoke access, so the subscription result still stands and the flag says so.
    // Only the plan, cycle, amount, method enum and period are stored: no card number, expiry or
    // security code exists anywhere in this payload.
    const payment = await db.from("subscription_payments").insert({
      user_id: user.id, plan, billing_cycle: cycle, amount_lkr: priceLkr, currency: "LKR",
      payment_method: paymentMethod, status: "succeeded", simulated: true,
      period_start: accessValues.started_at, period_end: accessValues.renews_at,
    });
    return response({ subscription: data, paymentMethod, priceLkr, billingRecorded, paymentRecorded: !payment.error, mocked: true });
  } catch {
    return response({ error: "Subscription unavailable. Check the server configuration or retry." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
