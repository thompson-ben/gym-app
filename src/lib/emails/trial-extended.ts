import { COMPANY_LINE, FOUNDER_NAME } from "../company";
import { esc } from "./layout";

export type TrialExtendedData = {
  displayName: string | null;
  /** The new end of the trial, after the extra days. */
  trialEndsAt: string;
  /** Their active split and its first workout, when they have one. */
  splitName: string | null;
  workoutName: string | null;
  siteUrl: string;
  timeZone?: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Sent when a trial that was about to end without a single workout gets 7 more days. A short,
 * plain note from the founder (no banner, button or price) that says what to do at the gym;
 * replies go to the contact address.
 */
export function trialExtendedEmail(d: TrialExtendedData) {
  const first = d.displayName?.trim().split(/\s+/)[0] ?? null;
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: d.timeZone ?? "Europe/London" }).format(new Date(d.trialEndsAt));

  const next =
    d.splitName && d.workoutName
      ? `Your ${d.splitName} split is ready. Next time you’re at the gym, open NotchLift, start ${d.workoutName} and tick off each set as you go.`
      : d.splitName
        ? `Your ${d.splitName} split is ready. Next time you’re at the gym, open NotchLift, start your first workout and tick off each set as you go.`
        : "Pick one of the starter splits (it takes about a minute), then next time you’re at the gym, start the first workout and tick off each set as you go.";

  const paras = [
    first ? `Hi ${first},` : "Hi,",
    `I’m ${FOUNDER_NAME}, I built NotchLift. Your free trial was about to end, and I noticed you haven’t had the chance to log a workout yet, so I’ve added 7 more days. It now ends on ${date}. Nothing to do, and no card needed.`,
    next,
    "After that first session, NotchLift shows what you did last time beside every set and tells you when to add weight. That’s when it starts to click.",
    "If something got in the way, just reply. I read every email.",
  ];

  const subject = "I’ve added a week to your NotchLift trial";
  const pStyle = "margin:0 0 14px;font-size:16px;line-height:24px;color:#16191b;";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background-color:#ffffff;font-family:${FONT};">
<div style="max-width:520px;">
${paras.map((t) => `<p style="${pStyle}">${esc(t)}</p>`).join("\n")}
<p style="${pStyle}">${esc(FOUNDER_NAME)}<br>Founder, NotchLift<br><a href="${esc(d.siteUrl)}/train" style="color:#16191b;">${esc(d.siteUrl.replace(/^https?:\/\//, ""))}</a></p>
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#8a9095;">${esc(COMPANY_LINE)}</p>
</div>
</body>
</html>`;
  const text = [...paras, `${FOUNDER_NAME}\nFounder, NotchLift\n${d.siteUrl}/train`].join("\n\n");
  return { subject, html, text };
}
