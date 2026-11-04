import { NextResponse } from "next/server";
import { billingSecret } from "@/lib/billing/server";
import { verifyUnsubscribe } from "@/lib/emails/unsubscribe";
import { supabaseAnon } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/**
 * Turns reminder emails off for the account a signed link names. Mail apps' one-click
 * unsubscribe (RFC 8058) POSTs here with "List-Unsubscribe=One-Click" and gets a plain answer;
 * the button on /unsubscribe POSTs a form and is sent back to that page.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    /* one-click requests may carry an empty or unusual body */
  }
  const userId = String(form?.get("u") ?? url.searchParams.get("u") ?? "");
  const token = String(form?.get("t") ?? url.searchParams.get("t") ?? "");
  const oneClick = form?.get("List-Unsubscribe") === "One-Click" || !form?.has("u");
  const secret = billingSecret();

  if (!verifyUnsubscribe(userId, token, secret)) {
    return oneClick ? new NextResponse("Invalid unsubscribe link.", { status: 400 }) : NextResponse.redirect(new URL("/unsubscribe?error=1", url), 303);
  }
  const { error } = await supabaseAnon().rpc("set_reminder_emails", { p_secret: secret, p_user: userId, p_enabled: false });
  if (error) {
    return oneClick ? new NextResponse("Couldn't unsubscribe just now. Please try again.", { status: 500 }) : NextResponse.redirect(new URL("/unsubscribe?error=1", url), 303);
  }
  return oneClick ? new NextResponse("You're unsubscribed from Setmodo reminder emails.", { status: 200 }) : NextResponse.redirect(new URL("/unsubscribe?done=1", url), 303);
}
