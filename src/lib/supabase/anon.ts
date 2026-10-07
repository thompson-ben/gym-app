import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** A server-side client with no user session (for secret-guarded or public functions). */
export function supabaseAnon() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
