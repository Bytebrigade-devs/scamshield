import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser-side Supabase client (anon key only; safe to expose). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Account service is not configured. Please contact the project administrator.");
    }
    client = createClient(url, key);
  }
  return client;
}
