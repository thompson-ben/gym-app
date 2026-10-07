import { NextResponse } from "next/server";
import { paymentsConfigured } from "@/lib/billing/server";
import { launchEmail } from "@/lib/emails/launch";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { SITE_URL } from "@/lib/site";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Moved = { email: string; display_name: string | null; trial_ends_at: string; confirmed: boolean };

/**
 * Admins: launch paid membership. New sign-ups start trials and every early-access member starts
 * a 14-day trial now (free-access members are untouched); each moved member is emailed.
 */
export async function POST(request: Request) {
  if (!paymentsConfigured()) return NextResponse.json({ error: "Set up Stripe first: payments aren’t switched on." }, { status: 409 });
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_launch_paid_plans", { p_confirm: body.confirm ?? "" });
  if (error) {
    const msg = error.message.includes("not_admin") ? "Only admins can do this." : error.message.includes("launch_not_confirmed") ? "Type LAUNCH to confirm." : "Launch failed. Nothing was changed.";
    return NextResponse.json({ error: msg }, { status: error.message.includes("not_admin") ? 403 : 400 });
  }
  const result = data as { trial_days: number; moved: Moved[] };
  let emailed = 0;
  if (emailConfigured()) {
    for (const m of result.moved) {
      if (!m.confirmed) continue;
      if (await sendEmail(m.email, launchEmail({ displayName: m.display_name, trialEndsAt: m.trial_ends_at, trialDays: result.trial_days, siteUrl: SITE_URL }))) emailed++;
      // Stay under the email provider's rate limit.
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  return NextResponse.json({ trials_started: result.moved.length, emailed });
}
