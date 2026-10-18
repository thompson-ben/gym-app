import { DAY_NAME, formatDays, isoWeekday, MAX_TRAINING_REMINDERS } from "../training-days";
import { emailLayout, esc, p } from "./layout";

export type TrainingDayData = {
  displayName: string | null;
  /** The days they said they train (1 = Monday … 7 = Sunday). */
  trainingDays: number[];
  /** Their active split and its first workout, when they've set one up. */
  splitName: string | null;
  workoutName: string | null;
  /** How many of these they've had before this one. */
  remindersSent: number;
  siteUrl: string;
};

/**
 * Sent on the mornings someone said they train, until they log a first workout (at most
 * MAX_TRAINING_REMINDERS times): their workout is ready, open NotchLift at the gym and tap Start.
 */
export function trainingDayEmail(d: TrainingDayData, now = new Date()) {
  const hi = d.displayName ? `Hi ${esc(d.displayName)},` : "Hi,";
  const today = DAY_NAME[isoWeekday(now)];
  const ready = Boolean(d.splitName && d.workoutName);
  const days = formatDays(d.trainingDays);
  const last = d.remindersSent + 1 >= MAX_TRAINING_REMINDERS;

  const subject = ready ? `${d.workoutName} today?` : `Training today?`;
  const step = ready
    ? `It’s ${today}, one of your training days, so your <strong>${esc(d.workoutName!)}</strong> workout from ${esc(d.splitName!)} is ready. When you get to the gym, open NotchLift and tap <strong>Start</strong>.`
    : `It’s ${today}, one of your training days. Pick a ready-made split in about 2 minutes, then tap <strong>Start</strong> at the gym.`;
  const stepText = ready
    ? `It’s ${today}, one of your training days, so your ${d.workoutName} workout from ${d.splitName} is ready. When you get to the gym, open NotchLift and tap Start.`
    : `It’s ${today}, one of your training days. Pick a ready-made split in about 2 minutes, then tap Start at the gym.`;
  const why = "Tick each set as you go. Next time, those numbers sit beside every set so you know what to beat.";
  const note = last
    ? `This is the last of these reminders. You can change your training days (${esc(days)}) in Profile.`
    : `You said you train on ${esc(days)}. We’ll send this on those mornings until your first workout, then stop. Change your days in Profile.`;
  const noteText = last
    ? `This is the last of these reminders. You can change your training days (${days}) in Profile.`
    : `You said you train on ${days}. We’ll send this on those mornings until your first workout, then stop. Change your days in Profile.`;
  const link = `${d.siteUrl}/train`;

  const html = emailLayout({
    title: subject,
    preheader: ready ? `Your ${d.workoutName} workout is ready. Tap Start at the gym.` : "Pick a split and you’re ready to train.",
    heading: ready ? `Your ${d.workoutName} workout is ready` : "Ready when you are",
    body: p(hi) + p(step) + p(why),
    button: { label: ready ? `Open ${d.workoutName}` : "Pick a split", href: link },
    after: `<p style="margin:20px 0 0;font-size:14px;line-height:20px;color:#6b7176;">${note}</p>`,
    footer: "You’re receiving this because you chose your training days in NotchLift.",
  });
  const text = `${d.displayName ? `Hi ${d.displayName},` : "Hi,"}\n\n${stepText}\n\n${why}\n\n${link}\n\n${noteText}`;
  return { subject, html, text };
}
