import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PlanId } from "@/lib/plans";

// MOCKED billing: no payment provider, no card data is ever received or stored.
const VALID_PLANS: PlanId[] = ["Sentinel", "Guardian", "Aegis"];

function clientFor(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { supabase, token };
}

async function authed(req: NextRequest) {
  const c = clientFor(req);
  if (!c) return null;
  const { data, error } = await c.supabase.auth.getUser(c.token);
  if (error || !data.user) return null;
  return { supabase: c.supabase, userId: data.user.id };
}

const unauthorized = () =>
  NextResponse.json({ error: "Authentication required to access subscriptions." }, { status: 401 });

export async function GET(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();
  const { data, error } = await a.supabase
    .from("subscriptions")
    .select("user_id, plan, status, billing_cycle, started_at, renews_at, cancelled_at")
    .eq("user_id", a.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to retrieve subscription status." }, { status: 500 });
  }
  return NextResponse.json({ subscription: data });
}

// Mock checkout: upgrade to approved tier (Sentinel / Guardian / Aegis)
export async function POST(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const requestedPlan: PlanId = body.plan;
  if (!VALID_PLANS.includes(requestedPlan)) {
    return NextResponse.json(
      { error: "Invalid plan. Choose Sentinel, Guardian, or Aegis." },
      { status: 400 }
    );
  }

  const cycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
  const digits = String(body.cardNumber ?? "").replace(/\s/g, "");
  if (!/^\d{16}$/.test(digits)) {
    return NextResponse.json(
      { error: "Enter a valid 16-digit synthetic test card number." },
      { status: 400 }
    );
  }

  const renews = new Date();
  if (cycle === "yearly") renews.setFullYear(renews.getFullYear() + 1);
  else renews.setMonth(renews.getMonth() + 1);

  const { data, error } = await a.supabase
    .from("subscriptions")
    .upsert({
      user_id: a.userId,
      plan: requestedPlan,
      status: "active",
      billing_cycle: cycle,
      started_at: new Date().toISOString(),
      renews_at: renews.toISOString(),
      cancelled_at: null,
    })
    .select("user_id, plan, status, billing_cycle, started_at, renews_at, cancelled_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Unable to record mock subscription." }, { status: 500 });
  }
  return NextResponse.json({ subscription: data });
}

// Cancel subscription (downgrades / sets status cancelled)
export async function DELETE(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();

  const { data, error } = await a.supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("user_id", a.userId)
    .select("user_id, plan, status, billing_cycle, started_at, renews_at, cancelled_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update cancellation status." }, { status: 500 });
  }
  return NextResponse.json({ subscription: data });
}
