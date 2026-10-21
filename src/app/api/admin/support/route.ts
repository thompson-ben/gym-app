import { NextResponse } from "next/server";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { supportReplyEmail } from "@/lib/emails/support";
import { SITE_URL } from "@/lib/site";
import { supportError, type AdminSupportThread } from "@/lib/support";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = { action?: "reply" | "status"; thread?: string; body?: string; close?: boolean; status?: string };

/** Admins: reply to a support thread (and email the member), or change its status. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const b = (await request.json().catch(() => ({}))) as Body;
  if (b.action === "status") {
    const { error } = await supabase.rpc("admin_support_set_status", { p_thread: b.thread ?? "", p_status: b.status ?? "" });
    if (error) return NextResponse.json({ error: supportError(error.message) ?? "Couldn’t change the status." }, { status: error.message.includes("not_admin") ? 403 : 400 });
    return NextResponse.json({ ok: true });
  }
  const { data, error } = await supabase.rpc("admin_support_reply", { p_thread: b.thread ?? "", p_body: b.body ?? "", p_close: b.close === true });
  if (error) return NextResponse.json({ error: supportError(error.message) ?? "Couldn’t send. Your reply is still here; please try again." }, { status: error.message.includes("not_admin") ? 403 : 400 });
  const thread = data as AdminSupportThread;
  const last = thread.messages[thread.messages.length - 1];
  const emailed =
    emailConfigured() &&
    (await sendEmail(
      thread.email,
      supportReplyEmail({ displayName: thread.display_name, subject: thread.subject, reply: last?.body ?? b.body ?? "", fromName: last?.admin_name ?? null, threadUrl: `${SITE_URL}/profile/support/${thread.id}` }),
    ));
  return NextResponse.json({ thread, emailed });
}
