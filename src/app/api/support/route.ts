import { NextResponse } from "next/server";
import { CONTACT_EMAIL } from "@/lib/company";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { supportNoticeEmail } from "@/lib/emails/support";
import { SITE_URL } from "@/lib/site";
import { supportError, topicLabel, type SupportThread } from "@/lib/support";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = { action?: "start" | "reply"; topic?: string; subject?: string; body?: string; thread?: string; page?: string | null; app_version?: string | null };

/** Members: start a support thread or reply on one. Emails the contact address a notice. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Body;
  const { data, error } =
    b.action === "reply"
      ? await supabase.rpc("support_reply", { p_thread: b.thread ?? "", p_body: b.body ?? "" })
      : await supabase.rpc("support_start", {
          p_topic: b.topic ?? "other",
          p_subject: b.subject ?? "",
          p_body: b.body ?? "",
          p_page: b.page ?? null,
          p_app_version: b.app_version ?? null,
          p_user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        });
  if (error) return NextResponse.json({ error: supportError(error.message) ?? "Couldn’t send. Your message is still here; please try again." }, { status: 400 });

  const thread = data as SupportThread;
  if (emailConfigured()) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
    await sendEmail(
      CONTACT_EMAIL,
      supportNoticeEmail({
        email: auth.user.email ?? "unknown",
        displayName: profile?.display_name ?? null,
        subject: thread.subject,
        topic: topicLabel(thread.topic),
        body: b.body ?? "",
        isReply: b.action === "reply",
        adminUrl: `${SITE_URL}/admin/support/${thread.id}`,
      }),
    );
  }
  return NextResponse.json({ thread });
}
