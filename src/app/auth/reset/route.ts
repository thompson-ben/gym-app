import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Password-recovery callback. A valid link signs the user in with a short recovery session
 * and continues to the new-password screen; an invalid, used or expired link (including
 * Supabase's own `error=access_denied&error_code=otp_expired` redirect) asks for a new one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const supabase = await supabaseServer();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");

  let ok = false;
  if (!searchParams.get("error")) {
    if (tokenHash) ok = !(await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error;
    else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  return NextResponse.redirect(new URL(ok ? "/reset-password" : "/forgot-password?error=link_invalid", origin));
}
