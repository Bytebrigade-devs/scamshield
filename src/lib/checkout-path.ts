import { isCycle, isPlan } from "./plans";

export function checkoutPath(plan: unknown, cycle: unknown) {
  return isPlan(plan) && isCycle(cycle) ? `/checkout?plan=${plan}&cycle=${cycle}` : null;
}

export function checkoutReturnPath(next: string | string[] | undefined) {
  if (typeof next !== "string" || !next.startsWith("/checkout?") || next.includes("#")) return null;
  const params = new URLSearchParams(next.slice("/checkout?".length));
  return checkoutPath(params.get("plan"), params.get("cycle"));
}

export function authPath(mode: "login" | "signup", next: string | null) {
  return next ? `/${mode}?next=${encodeURIComponent(next)}` : `/${mode}`;
}