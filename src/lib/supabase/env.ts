export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return { url, key };
}

/**
 * The sign-in cookie's name. Supabase names it after the first part of the API address
 * ("sb-<project-ref>-auth-token"), so moving production to api.notchlift.com would rename it
 * to "sb-api-auth-token" and sign everyone out. Production keeps its original name instead.
 * Everywhere else (local, previews on the default address) uses Supabase's default.
 */
export function authCookieOptions(url: string): { name: string } | undefined {
  return new URL(url).hostname === "api.notchlift.com" ? { name: "sb-ffrufyxoqjzijzqsbntm-auth-token" } : undefined;
}
