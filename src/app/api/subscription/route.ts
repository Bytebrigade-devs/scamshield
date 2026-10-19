import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// MOCKED billing: no payment provider, no card data is ever received or stored.

function clientFor(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  return { supabase, token };
}

async function authed(req: NextRequest) {
  const c = clientFor(req);
  if (!c) return null;
  const { data, error } = await c.supabase.auth.getUser(c.token);
  if (error || !data.user) return null;
  return { supabase: c.supabase, userId: data.user.id };
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();
  const { data, error } = await a.supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", a.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}

// Mock checkout: upgrade to premium. Validates the fake card number format only.
export async function POST(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const cycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
  const digits = String(body.cardNumber ?? "").replace(/\s/g, "");
  if (!/^\d{16}$/.test(digits)) {
    return NextResponse.json({ error: "Enter a 16-digit test card number" }, { status: 400 });
  }
  const renews = new Date();
  if (cycle === "yearly") renews.setFullYear(renews.getFullYear() + 1);
  else renews.setMonth(renews.getMonth() + 1);

  const { data, error } = await a.supabase
    .from("subscriptions")
    .upsert({
      user_id: a.userId,
      plan: "premium",
      status: "active",
      billing_cycle: cycle,
      started_at: new Date().toISOString(),
      renews_at: renews.toISOString(),
      cancelled_at: null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}

// Choose the free plan (used right after signup).
export async function PUT(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();
  const { data, error } = await a.supabase
    .from("subscriptions")
    .upsert({
      user_id: a.userId,
      plan: "free",
      status: "active",
      billing_cycle: null,
      renews_at: null,
      cancelled_at: null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}

// Cancel: downgrade to free.
export async function DELETE(req: NextRequest) {
  const a = await authed(req);
  if (!a) return unauthorized();
  const { data, error } = await a.supabase
    .from("subscriptions")
    .update({
      plan: "free",
      status: "cancelled",
      billing_cycle: null,
      renews_at: null,
      cancelled_at: new Date().toISOString(),
    })
    .eq("user_id", a.userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}
