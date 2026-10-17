import { NextResponse } from "next/server";
import { billingSecret } from "@/lib/billing/server";
import { firstWorkoutEmail } from "@/lib/emails/first-workout";
import { referralRewardEmail } from "@/lib/emails/referral-reward";
import { trialEndedEmail } from "@/lib/emails/trial-ended";
import { trialEndingEmail } from "@/lib/emails/trial-ending";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/emails/unsubscribe";
import { SITE_URL } from "@/lib/site";
import { supabaseAnon } from "@/lib/supabase/anon";
import { isWeightUnit } from "@/lib/units";

export const dynamic = "force-dynamic";

type Due = { user_id: string; email: string; display_name: string | null; trial_ends_at: string; weight_unit: string; workouts: number; working_sets: number; volume_kg: number | string };

/**
 * Daily: emails everyone whose trial ends within 3 days (once each), anyone who earned
 * referral days since the last run, asks once why a trial ended without a plan, and nudges
 * new accounts that haven't logged a first workout by the next morning. Reminder emails carry an
 * unsubscribe link and header, and skip anyone who has turned them off. Called by a scheduled job with
 * "Authorization: Bearer <CRON_SECRET>".
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

  // People who turned reminder emails off (migration 25; before it nobody has). Their reminders
  // are marked as handled without sending, so they aren't picked up again tomorrow.
  const { data: optOutRows } = await db.rpc("reminder_opt_outs", { p_secret: secret });
  const optedOut = new Set(((optOutRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const links = (userId: string) => ({ pageUrl: unsubscribePageUrl(SITE_URL, userId, secret), oneClickUrl: unsubscribeOneClickUrl(SITE_URL, userId, secret) });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of (data ?? []) as Due[]) {
    if (optedOut.has(row.user_id)) {
      await db.rpc("mark_trial_reminded", { p_secret: secret, p_user: row.user_id });
      skipped++;
      continue;
    }
    const msg = trialEndingEmail({
      displayName: row.display_name,
      trialEndsAt: row.trial_ends_at,
      unit: isWeightUnit(row.weight_unit) ? row.weight_unit : "kg",
      workouts: row.workouts,
      workingSets: row.working_sets,
      volumeKg: Number(row.volume_kg),
      siteUrl: SITE_URL,
    });
    if (await sendEmail(row.email, msg, links(row.user_id))) {
      await db.rpc("mark_trial_reminded", { p_secret: secret, p_user: row.user_id });
      sent++;
    } else {
      failed++;
    }
  }

  // Referral rewards earned since the last run (migration 18; before it this is skipped).
  let rewards = 0;
  const { data: rewarded, error: rewardError } = await db.rpc("referral_rewards_to_notify", { p_secret: secret });
  if (!rewardError) {
    for (const row of (rewarded ?? []) as { user_id: string; email: string; display_name: string | null; trial_ends_at: string }[]) {
      if (await sendEmail(row.email, referralRewardEmail({ displayName: row.display_name, trialEndsAt: row.trial_ends_at, siteUrl: SITE_URL }))) {
        await db.rpc("mark_referral_notified", { p_secret: secret, p_user: row.user_id });
        rewards++;
      } else {
        failed++;
      }
    }
  }

  // Trials that ended unpaid in the last 3 days: one email asking why (migration 19; before it this is skipped).
  let exits = 0;
  const { data: ended, error: endedError } = await db.rpc("trial_exit_emails_due", { p_secret: secret });
  if (!endedError) {
    for (const row of (ended ?? []) as { user_id: string; email: string; display_name: string | null; workouts: number }[]) {
      if (optedOut.has(row.user_id)) {
        await db.rpc("mark_trial_exit_emailed", { p_secret: secret, p_user: row.user_id });
        skipped++;
        continue;
      }
      if (await sendEmail(row.email, trialEndedEmail({ displayName: row.display_name, workouts: row.workouts, siteUrl: SITE_URL }), links(row.user_id))) {
        await db.rpc("mark_trial_exit_emailed", { p_secret: secret, p_user: row.user_id });
        exits++;
      } else {
        failed++;
      }
    }
  }

  // Signed up 18–72 hours ago and not trained yet: one "first workout" email (migration 22; before it this is skipped).
  let nudges = 0;
  const { data: idle, error: idleError } = await db.rpc("first_workout_nudges_due", { p_secret: secret });
  if (!idleError) {
    for (const row of (idle ?? []) as { user_id: string; email: string; display_name: string | null; trial_ends_at: string | null; split_name: string | null; workout_name: string | null }[]) {
      if (optedOut.has(row.user_id)) {
        await db.rpc("mark_first_workout_nudged", { p_secret: secret, p_user: row.user_id });
        skipped++;
        continue;
      }
      const msg = firstWorkoutEmail({ displayName: row.display_name, splitName: row.split_name, workoutName: row.workout_name, trialEndsAt: row.trial_ends_at, siteUrl: SITE_URL });
      if (await sendEmail(row.email, msg, links(row.user_id))) {
        await db.rpc("mark_first_workout_nudged", { p_secret: secret, p_user: row.user_id });
        nudges++;
      } else {
        failed++;
      }
    }
  }
  return NextResponse.json({ sent, rewards, exits, nudges, skipped, failed });
}
