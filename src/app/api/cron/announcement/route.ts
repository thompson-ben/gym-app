import { NextResponse } from "next/server";
import { billingSecret } from "@/lib/billing/server";
import { appStoreLaunchEmail } from "@/lib/emails/app-store-launch";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/emails/unsubscribe";
import { FOUNDER_NAME } from "@/lib/company";
import { SITE_URL } from "@/lib/site";
import { supabaseAnon } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One-off announcements this route can send, by id (?id=…). */
const ANNOUNCEMENTS = {
  "app-store-launch": (displayName: string | null) => appStoreLaunchEmail({ displayName, siteUrl: SITE_URL }),
} as const;

/**
 * Sends a one-off announcement to every member who hasn't had it yet and hasn't turned emails
 * off (migration 39), with an unsubscribe link. Each person gets it once, so a scheduled job can
 * call this again safely. Called with "Authorization: Bearer <CRON_SECRET>".
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 32 || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!(id in ANNOUNCEMENTS)) return NextResponse.json({ error: "unknown announcement" }, { status: 400 });
  const secret = billingSecret();
  if (!secret || !emailConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const db = supabaseAnon();
  const { data, error } = await db.rpc("announcement_recipients", { p_secret: secret, p_announcement: id, p_limit: 200 });
  if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as { user_id: string; email: string; display_name: string | null }[]) {
    const msg = ANNOUNCEMENTS[id as keyof typeof ANNOUNCEMENTS](row.display_name);
    const links = { pageUrl: unsubscribePageUrl(SITE_URL, row.user_id, secret), oneClickUrl: unsubscribeOneClickUrl(SITE_URL, row.user_id, secret) };
    if (await sendEmail(row.email, msg, links, { fromName: `${FOUNDER_NAME} from Setmodo` })) {
      await db.rpc("mark_announcement_sent", { p_secret: secret, p_announcement: id, p_user: row.user_id });
      sent++;
    } else {
      failed++;
    }
    // Resend allows a few requests a second.
    await new Promise((r) => setTimeout(r, 250));
  }
  return NextResponse.json({ ok: true, sent, failed });
}
