import { NextResponse } from "next/server";
import { billingSecret } from "@/lib/billing/server";
import { checkinEmail } from "@/lib/emails/checkin";
import { firstWorkoutEmail } from "@/lib/emails/first-workout";
import { referralRewardEmail } from "@/lib/emails/referral-reward";
import { trialEndedEmail } from "@/lib/emails/trial-ended";
import { trialEndingEmail } from "@/lib/emails/trial-ending";
import { trialExtendedEmail } from "@/lib/emails/trial-extended";
import { trainingDayEmail } from "@/lib/emails/training-day";
import { emailConfigured, sendEmail } from "@/lib/emails/send";
import { unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/emails/unsubscribe";
import { FOUNDER_NAME } from "@/lib/company";
import { SITE_URL } from "@/lib/site";
import { supabaseAnon } from "@/lib/supabase/anon";
import { isWeightUnit } from "@/lib/units";

export const dynamic = "force-dynamic";

type Due = { user_id: string; email: string; display_name: string | null; trial_ends_at: string; weight_unit: string; workouts: number; working_sets: number; volume_kg: number | string };

/**
 * Daily: first gives 7 more days (once) to trials about to end without a workout, with a note from
 * the founder. Then emails everyone whose trial ends within 3 days (once each), anyone who earned
 * referral days since the last run, asks once why a trial ended without a plan, and nudges
 * new accounts that haven't logged a first workout by the next morning. Until that first workout,
 * people who chose training days get a short reminder on those mornings, and a week after
 * sign-up one personal check-in from the founder. Nobody gets two of these in one run. Reminder emails carry an
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

  // People who turned reminder emails off (migration 25; before it nobody has). Their reminders
  // are marked as handled without sending, so they aren't picked up again tomorrow.
  const { data: optOutRows } = await db.rpc("reminder_opt_outs", { p_secret: secret });
  const optedOut = new Set(((optOutRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const links = (userId: string) => ({ pageUrl: unsubscribePageUrl(SITE_URL, userId, secret), oneClickUrl: unsubscribeOneClickUrl(SITE_URL, userId, secret) });

  // Everyone emailed in this run, so the getting-started emails never double up on one morning.
  const emailed = new Set<string>();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Trials about to end without a workout get 7 more days, before the reminders below are picked
  // (migration 35; before it this is skipped). The extension stands even if the note fails to send.
  let extended = 0;
  const { data: extendedRows, error: extendError } = await db.rpc("extend_untrained_trials", { p_secret: secret });
  if (!extendError) {
    for (const row of (extendedRows ?? []) as { user_id: string; email: string; display_name: string | null; trial_ends_at: string; split_name: string | null; workout_name: string | null }[]) {
      extended++;
      if (optedOut.has(row.user_id)) {
        skipped++;
        continue;
      }
      const msg = trialExtendedEmail({ displayName: row.display_name, trialEndsAt: row.trial_ends_at, splitName: row.split_name, workoutName: row.workout_name, siteUrl: SITE_URL });
      if (await sendEmail(row.email, msg, links(row.user_id), { fromName: `${FOUNDER_NAME} from NotchLift` })) {
        emailed.add(row.user_id);
      } else {
        failed++;
      }
    }
  }

  const { data, error } = await db.rpc("trial_reminders_due", { p_secret: secret });
  if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });
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
      emailed.add(row.user_id);
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
        emailed.add(row.user_id);
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
        emailed.add(row.user_id);
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
        emailed.add(row.user_id);
        nudges++;
      } else {
        failed++;
      }
    }
  }

  // A week after sign-up and still no workout: one personal check-in (migration 26; before it this is skipped).
  // People who turned reminders off aren't returned. Anyone already emailed in this run waits until tomorrow.
  let checkins = 0;
  const { data: quiet, error: quietError } = await db.rpc("checkin_emails_due", { p_secret: secret });
  if (!quietError) {
    for (const row of (quiet ?? []) as { user_id: string; email: string; display_name: string | null; training_days: number[] | null; has_split: boolean; split_name: string | null }[]) {
      if (emailed.has(row.user_id)) continue;
      const msg = checkinEmail({ displayName: row.display_name, trainingDays: row.training_days, hasSplit: row.has_split, splitName: row.split_name, siteUrl: SITE_URL });
      if (await sendEmail(row.email, msg, links(row.user_id), { fromName: `${FOUNDER_NAME} from NotchLift` })) {
        await db.rpc("mark_checkin_emailed", { p_secret: secret, p_user: row.user_id });
        emailed.add(row.user_id);
        checkins++;
      } else {
        failed++;
      }
    }
  }

  // On one of their training days, until their first workout: "your workout is ready" (migration 26).
  let trainingDays = 0;
  const { data: today, error: todayError } = await db.rpc("training_day_reminders_due", { p_secret: secret });
  if (!todayError) {
    for (const row of (today ?? []) as { user_id: string; email: string; display_name: string | null; training_days: number[]; split_name: string | null; workout_name: string | null; reminders_sent: number }[]) {
      if (emailed.has(row.user_id)) continue;
      const msg = trainingDayEmail({ displayName: row.display_name, trainingDays: row.training_days, splitName: row.split_name, workoutName: row.workout_name, remindersSent: row.reminders_sent, siteUrl: SITE_URL });
      if (await sendEmail(row.email, msg, links(row.user_id))) {
        await db.rpc("mark_training_reminder_sent", { p_secret: secret, p_user: row.user_id });
        emailed.add(row.user_id);
        trainingDays++;
      } else {
        failed++;
      }
    }
  }
  return NextResponse.json({ extended, sent, rewards, exits, nudges, checkins, trainingDays, skipped, failed });
}
