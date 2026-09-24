import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Email-confirmation callback. Accepts the `token_hash` links produced by Splitmate's email
 * templates (work on any device) and the PKCE `code` links of Supabase's default template
 * (work only in the browser that signed up). Failed or expired links go back to sign-in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const cookieNext = request.cookies.get("sm_next")?.value;
  const next = safeNext(searchParams.get("next") ?? (cookieNext ? decodeURIComponent(cookieNext) : null));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await supabaseServer();

  let ok = false;
  if (!searchParams.get("error") && code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (!searchParams.get("error") && tokenHash && type && type !== "recovery") {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  const response = NextResponse.redirect(new URL(ok ? next : "/sign-in?error=confirm_failed", origin));
  response.cookies.delete("sm_next");
  return response;
}
