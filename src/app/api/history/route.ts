import { createHistoryRoute } from "@/lib/scam-checker/boundary/history-route";
import type { M2SubscriptionDecision } from "@/lib/scam-checker/boundary/m2-entitlement-adapter";
import { getSubscriptionContext } from "@/lib/subscription-server";

import { selection } from "../feedback-support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/api/history` — the caller's own retained checks, read-only.
 *
 * The route exists so retiring the Netlify demo did not take the capability with it: before
 * 24 November 2026 `GET /api/history` lived only in `ui/netlify-handler.ts`. The decisions stay in
 * `boundary/history-route.ts` (`createHistoryRoute`) and the only store access is
 * `listOwned(subjectKey)` — the subject is the verified session's id, never anything the browser
 * sends. A caller with no verifiable session gets 401, never another user's rows.
 */
const handle = createHistoryRoute({
  // The session is resolved once, below, and passed through unchanged; the route itself never
  // reads a request.
  resolveDecision: (session) => session as M2SubscriptionDecision | null | undefined,
  listOwned: async (subjectKey, now) => selection.persistence.history.listOwned(subjectKey, now),
});

export async function GET(request: Request): Promise<Response> {
  let decision: M2SubscriptionDecision | null = null;
  try {
    decision = await getSubscriptionContext(request);
  } catch {
    decision = null; // an unresolvable session must fail closed, not fall through to a blank list
  }

  const response = await handle({ method: request.method, session: decision });
  return Response.json(response.body, { status: response.status, headers: response.headers });
}
