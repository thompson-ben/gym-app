import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { NEW_OAUTH_COOKIE, isNewOAuthAccount, oauthReturnError } from "@/lib/auth-providers";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Email-confirmation and Apple / Google sign-in callback. Accepts the `token_hash` links produced
 * by Setmodo's email templates (work on any device) and PKCE `code` links: Supabase's default
 * email template and the return from Apple or Google (both finish in the browser that started).
 * Failed, cancelled or expired attempts go back to sign-in with a message.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const cookieNext = request.cookies.get("sm_next")?.value;
  const next = safeNext(searchParams.get("next") ?? (cookieNext ? decodeURIComponent(cookieNext) : null));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const providerError = oauthReturnError(searchParams.get("error"), searchParams.get("error_description"));
  const supabase = await supabaseServer();

  let ok = false;
  let newOAuth = false;
  if (!searchParams.get("error") && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    newOAuth = ok && isNewOAuthAccount(data.user, new Date());
  } else if (!searchParams.get("error") && tokenHash && type && type !== "recovery") {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  const failure = providerError ?? "confirm_failed";
  const response = NextResponse.redirect(new URL(ok ? next : `/sign-in?error=${failure}`, origin));
  response.cookies.delete("sm_next");
  if (newOAuth) response.cookies.set(NEW_OAUTH_COOKIE, "1", { path: "/", maxAge: 600, sameSite: "lax" });
  return response;
}
