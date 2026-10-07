import { NextResponse } from "next/server";
import { billingSecret } from "@/lib/billing/server";
import { trialEndingEmail } from "@/lib/emails/trial-ending";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { SITE_URL } from "@/lib/site";
import { supabaseAnon } from "@/lib/supabase/anon";
import { isWeightUnit } from "@/lib/units";

export const dynamic = "force-dynamic";

type Due = { user_id: string; email: string; display_name: string | null; trial_ends_at: string; weight_unit: string; workouts: number; working_sets: number; volume_kg: number | string };

/**
 * Daily: emails everyone whose trial ends within 3 days (once each). Called by a scheduled job
 * with "Authorization: Bearer <CRON_SECRET>".
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 32 || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = billingSecret();
  if (!secret || !emailConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const db = supabaseAnon();
  const { data, error } = await db.rpc("trial_reminders_due", { p_secret: secret });
  if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Due[]) {
    const msg = trialEndingEmail({
      displayName: row.display_name,
      trialEndsAt: row.trial_ends_at,
      unit: isWeightUnit(row.weight_unit) ? row.weight_unit : "kg",
      workouts: row.workouts,
      workingSets: row.working_sets,
      volumeKg: Number(row.volume_kg),
      siteUrl: SITE_URL,
    });
    if (await sendEmail(row.email, msg)) {
      await db.rpc("mark_trial_reminded", { p_secret: secret, p_user: row.user_id });
      sent++;
    } else {
      failed++;
    }
  }
  return NextResponse.json({ sent, failed });
}
