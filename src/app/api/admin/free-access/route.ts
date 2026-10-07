import { NextResponse } from "next/server";
import { freeAccessEmail } from "@/lib/emails/free-access";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { SITE_URL } from "@/lib/site";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Admins: give someone free access (and email an invite if they have no account yet). */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const body = (await request.json().catch(() => ({}))) as { email?: string; note?: string };
  const { data, error } = await supabase.rpc("admin_grant_free_access", { p_email: body.email ?? "", p_note: body.note ?? null });
  if (error) {
    const message = error.message.includes("not_admin") ? "Only admins can do this." : error.message.includes("invalid_email") ? "That doesn’t look like an email address." : "Couldn’t save. Please try again.";
    return NextResponse.json({ error: message }, { status: error.message.includes("not_admin") ? 403 : 400 });
  }
  const result = data as { result: "invited" | "granted" | "already_free"; email: string; was_paying?: boolean };
  let emailed = false;
  if (result.result === "invited" && emailConfigured()) {
    const { data: profile } = await supabase.from("profiles").select("display_name").maybeSingle();
    emailed = await sendEmail(result.email, freeAccessEmail({ email: result.email, inviterName: profile?.display_name ?? null, note: body.note?.trim() || null, siteUrl: SITE_URL }));
  }
  return NextResponse.json({ ...result, emailed });
}

export async function DELETE(request: Request) {
  const supabase = await supabaseServer();
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const { error } = await supabase.rpc("admin_revoke_invite", { p_email: body.email ?? "" });
  if (error) return NextResponse.json({ error: "Couldn’t remove the invite." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
