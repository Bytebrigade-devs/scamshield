/**
 * M4 checker — signed-in session token (client-only).
 *
 * Reuses the house pattern from `src/lib/subscription-client.ts`: read the Supabase session and
 * return its access token, or null when there is no session. Tolerates demo mode and a missing
 * account-service configuration (getSupabase throws) by returning null, so anonymous checks keep
 * working exactly as before. The token is only ever sent as an Authorization header to our own
 * same-origin routes; it is never rendered or stored by the checker.
 */

import { getSupabase } from "@/lib/supabase";
import { DEMO_MODE } from "@/lib/m2-mode";

export async function accessToken(): Promise<string | null> {
  if (DEMO_MODE) return null;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}