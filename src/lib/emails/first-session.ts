import { APP_STORE_URL } from "../site";
import { isAddedWeight, isTimed, isUnloaded, type TrackingMode } from "../types";
import { formatWeight, type WeightUnit } from "../units";
import { appStoreNote, emailLayout, esc, p } from "./layout";

export type FirstSessionExercise = { name: string; mode: string; weight_kg: number | string | null; reps: number | null };

export type FirstSessionData = {
  displayName: string | null;
  workoutName: string;
  workingSets: number;
  /** Best working set of each exercise, in workout order. */
  exercises: FirstSessionExercise[];
  unit: WeightUnit;
  /** Null for accounts that aren't on a trial. */
  trialEndsAt: string | null;
  siteUrl: string;
};

const MODES: TrackingMode[] = ["weight_reps", "bodyweight_reps", "added_weight_reps", "duration", "added_weight_duration"];

/** "60 kg × 8", "+10 kg × 6", "BW × 8", "12 reps", "45 s", in the member's unit. */
export function bestSetLabel(e: FirstSessionExercise, unit: WeightUnit): string {
  const mode = (MODES as string[]).includes(e.mode) ? (e.mode as TrackingMode) : "weight_reps";
  const reps = e.reps ?? 0;
  const amount = isTimed(mode) ? `${reps} s` : `${reps}`;
  const kg = e.weight_kg === null ? 0 : Number(e.weight_kg);
  if (isUnloaded(mode)) return isTimed(mode) ? amount : `${reps} reps`;
  if (isAddedWeight(mode)) return kg > 0 ? `+${formatWeight(kg, unit)} × ${amount}` : `BW × ${amount}`;
  return `${formatWeight(kg, unit)} × ${amount}`;
}

/**
 * Sent once, the morning after someone's first workout: what they did, and the best set of each
 * exercise to beat next time (the moment the habit forms, so it isn't silent).
 */
export function firstSessionEmail(d: FirstSessionData, now = new Date()) {
  const first = d.displayName?.trim().split(/\s+/)[0] || null;
  const hi = first ? `Hi ${esc(first)},` : "Hi,";
  const days = d.trialEndsAt ? Math.ceil((new Date(d.trialEndsAt).getTime() - now.getTime()) / 86_400_000) : null;
  const trialLeft = days && days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : null;

  const count = d.exercises.length;
  const sets = `${d.workingSets} working ${d.workingSets === 1 ? "set" : "sets"}`;
  const across = count > 1 ? ` across ${count} exercises` : "";
  const subject = "Nice first session 💪";
  const rows = d.exercises
    .map(
      (e) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #e0e3df;font-size:15px;line-height:20px;color:#16191b;">${esc(e.name)}</td><td align="right" style="padding:10px 0 10px 12px;border-top:1px solid #e0e3df;font-size:15px;line-height:20px;font-weight:700;color:#16191b;white-space:nowrap;">${esc(bestSetLabel(e, d.unit))}</td></tr>`,
    )
    .join("");
  const table = count
    ? `<p style="margin:20px 0 6px;font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#6b7176;">Next time, beat these</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;border-bottom:1px solid #e0e3df;">${rows}</table>`
    : "";
  const next = `Next time you start ${esc(d.workoutName)}, these numbers sit beside every set. One more rep, or a little more weight, and you're progressing.`;
  const trial = trialLeft ? ` Your free trial has <strong>${trialLeft}</strong> left.` : "";
  const link = `${d.siteUrl}/train`;

  const html = emailLayout({
    title: subject,
    preheader: `${d.workoutName}: ${sets} logged. Here's what to beat next time.`,
    heading: subject,
    body: p(hi) + p(`You finished your first workout, <strong>${esc(d.workoutName)}</strong>: ${sets}${across}. That's the hardest one done.`) + table + p(next + trial),
    button: { label: "Plan your next workout", href: link },
    after: appStoreNote(d.siteUrl, APP_STORE_URL),
    footer: "You're receiving this once, after your first workout in Setmodo.",
  });

  const list = d.exercises.map((e) => `- ${e.name}: ${bestSetLabel(e, d.unit)}`).join("\n");
  const text = [
    first ? `Hi ${first},` : "Hi,",
    `You finished your first workout, ${d.workoutName}: ${sets}${across}. That's the hardest one done.`,
    count ? `Next time, beat these:\n${list}` : null,
    `Next time you start ${d.workoutName}, these numbers sit beside every set. One more rep, or a little more weight, and you're progressing.${trialLeft ? ` Your free trial has ${trialLeft} left.` : ""}`,
    link,
    `On iPhone? Get Setmodo on the App Store (same account, same history): ${APP_STORE_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject, html, text };
}
