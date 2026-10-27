import { demoSubscriptionRequest } from "./demo-store";

export async function subscriptionRequest(method = "GET", body?: unknown) {
  await new Promise(resolve => setTimeout(resolve, 250));
  return demoSubscriptionRequest(method, body);
}
