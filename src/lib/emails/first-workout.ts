import { emailLayout, esc, p } from "./layout";

export type FirstWorkoutData = {
  displayName: string | null;
  /** Their active split and its first workout, when they've set one up. */
  splitName: string | null;
  workoutName: string | null;
  /** Null for accounts that aren't on a trial (e.g. free access). */
  trialEndsAt: string | null;
  siteUrl: string;
};

/**
 * Sent once, the morning after sign-up, to people who haven't logged a workout yet. Says the
 * one next step: start the workout that's waiting, or pick a ready-made split.
 */
export function firstWorkoutEmail(d: FirstWorkoutData, now = new Date()) {
  const hi = d.displayName ? `Hi ${esc(d.displayName)},` : "Hi,";
  const ready = Boolean(d.splitName && d.workoutName);
  const days = d.trialEndsAt ? Math.max(1, Math.ceil((new Date(d.trialEndsAt).getTime() - now.getTime()) / 86_400_000)) : null;
  const trial = days ? ` Your free trial has <strong>${days} ${days === 1 ? "day" : "days"}</strong> left.` : "";
  const trialText = days ? ` Your free trial has ${days} ${days === 1 ? "day" : "days"} left.` : "";

  const subject = ready ? `Your ${d.workoutName} workout is ready` : "Ready to train? Pick a split in 2 minutes";
  const step = ready
    ? `Your <strong>${esc(d.workoutName!)}</strong> workout from ${esc(d.splitName!)} is ready. Next time you're at the gym, open NotchLift and tap <strong>Start</strong>.`
    : `Pick a ready-made split (Full Body, Upper / Lower or Push / Pull / Legs), or build your own, and you're ready to train in about 2 minutes.`;
  const why = "After your first session, last time's numbers sit beside every set, so you always know what to beat. That's when NotchLift starts to earn its place.";
  const stepText = ready
    ? `Your ${d.workoutName} workout from ${d.splitName} is ready. Next time you're at the gym, open NotchLift and tap Start.`
    : "Pick a ready-made split (Full Body, Upper / Lower or Push / Pull / Legs), or build your own, and you're ready to train in about 2 minutes.";
  const link = `${d.siteUrl}/train`;

  const html = emailLayout({
    title: subject,
    preheader: ready ? "Open NotchLift at the gym and tap Start." : "Choose a ready-made split and you're set.",
    heading: ready ? "Your first workout is waiting" : "Let's get your first workout in",
    body: p(hi) + p(step) + p(why + trial),
    button: { label: ready ? `Open ${d.workoutName}` : "Pick a split", href: link },
    footer: "You're receiving this once because you signed up for NotchLift. We won't send another reminder like it.",
  });
  const text = `${d.displayName ? `Hi ${d.displayName},` : "Hi,"}\n\n${stepText}\n\n${why}${trialText}\n\n${link}\n\nWe won't send another reminder like this.`;
  return { subject, html, text };
}
