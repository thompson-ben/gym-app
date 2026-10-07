import { PLANS, YEARLY_PER_MONTH, YEARLY_SAVING_PCT } from "../billing/plans";
import { toUnit, type WeightUnit } from "../units";
import { emailLayout, esc, p } from "./layout";

export type TrialEndingData = {
  displayName: string | null;
  trialEndsAt: string;
  unit: WeightUnit;
  workouts: number;
  workingSets: number;
  volumeKg: number;
  siteUrl: string;
  timeZone?: string;
};

/** "Your trial ends in 2 days", leading with the yearly offer. */
export function trialEndingEmail(d: TrialEndingData, now = new Date()) {
  const days = Math.max(1, Math.ceil((new Date(d.trialEndsAt).getTime() - now.getTime()) / 86_400_000));
  const when = days === 1 ? "tomorrow" : `in ${days} days`;
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: d.timeZone ?? "Europe/London" }).format(new Date(d.trialEndsAt));
  const hi = d.displayName ? `Hi ${esc(d.displayName)},` : "Hi,";
  const volume = Math.round(toUnit(d.volumeKg, d.unit)).toLocaleString("en-GB");
  const progress =
    d.workouts > 0
      ? `So far you’ve logged <strong>${d.workouts} ${d.workouts === 1 ? "workout" : "workouts"}</strong> and <strong>${d.workingSets} working sets</strong>${d.volumeKg > 0 ? `, moving <strong>${volume} ${d.unit}</strong>` : ""}. Keep that history building.`
      : "You haven’t logged a workout yet. There’s still time: start one today and see your previous sets, targets and progress come together.";
  const subject = `Your NotchLift trial ends ${when}`;
  const upgrade = `${d.siteUrl}/upgrade?plan=yearly`;
  const html = emailLayout({
    title: subject,
    preheader: `Keep training for ${PLANS.yearly.price} a year: that’s ${YEARLY_PER_MONTH} a month.`,
    heading: `Your free trial ends ${when}`,
    body:
      p(hi) +
      p(`Your NotchLift trial ends on ${esc(date)}. ${progress}`) +
      p(
        `Stay on track for <strong>${PLANS.yearly.price} a year</strong>, just ${YEARLY_PER_MONTH} a month and ${YEARLY_SAVING_PCT}% less than paying monthly. Or choose ${PLANS.monthly.price} a month and cancel any time.`,
      ),
    button: { label: `Keep training for ${PLANS.yearly.price} a year`, href: upgrade },
    after:
      `<p style="margin:16px 0 0;text-align:center;font-size:14px;line-height:21px;"><a href="${esc(d.siteUrl)}/upgrade?plan=monthly" target="_blank" style="color:#45700f;">Or ${PLANS.monthly.price} a month</a></p>` +
      `<p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #e0e3df;font-size:13px;line-height:20px;color:#6b7176;">If you don’t upgrade, nothing is deleted. Your history and progress stay in your account and you can export them any time; only starting new workouts is paused.</p>`,
    footer: "You’re receiving this because your NotchLift free trial is ending. It’s the only reminder we send.",
  });
  const text = [
    `${hi.replace(/<[^>]+>/g, "")}`,
    "",
    `Your NotchLift trial ends on ${date}. ${progress.replace(/<[^>]+>/g, "")}`,
    "",
    `Stay on track for ${PLANS.yearly.price} a year (${YEARLY_PER_MONTH} a month, ${YEARLY_SAVING_PCT}% less than monthly): ${upgrade}`,
    `Or ${PLANS.monthly.price} a month: ${d.siteUrl}/upgrade?plan=monthly`,
    "",
    "If you don’t upgrade, nothing is deleted: your history stays and you can export it any time.",
  ].join("\n");
  return { subject, html, text };
}
