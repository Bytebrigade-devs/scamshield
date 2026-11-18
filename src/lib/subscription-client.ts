import { demoSubscriptionRequest } from "./demo-store";
import { DEMO_MODE } from "./m2-mode";
import { getSupabase } from "./supabase";
import type { Subscription } from "./plans";
import type { evaluateEntitlement } from "./entitlement";

type SubscriptionResponse = { subscription: Subscription | null; entitlement?: ReturnType<typeof evaluateEntitlement>; emailSent?: boolean; mocked: boolean };
export async function subscriptionRequest(method = "GET", body?: unknown): Promise<SubscriptionResponse> {
  if (DEMO_MODE) return demoSubscriptionRequest(method, body);
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Log in to manage your subscription.");
  const result = await fetch("/api/subscription", {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await result.json();
  if (!result.ok) throw new Error(json.error || "Subscription unavailable. Please retry.");
  return json;
}
