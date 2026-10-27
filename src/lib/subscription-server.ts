import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export async function verifiedUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing. Follow docs/M2-INTERIM.md.");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : { db, user: data.user };
}

/** Server routes only. This secret must never have a NEXT_PUBLIC prefix. */
export function subscriptionWriter() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Subscription server configuration is missing. Follow docs/M2-INTERIM.md.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
