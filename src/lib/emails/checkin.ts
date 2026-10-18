import { COMPANY_LINE, FOUNDER_NAME } from "../company";
import { formatDays } from "../training-days";
import { esc } from "./layout";

export type CheckinData = {
  displayName: string | null;
  trainingDays: number[] | null;
  /** Whether they've made or copied any split. */
  hasSplit: boolean;
  /** Their active split, when they have one. */
  splitName: string | null;
  siteUrl: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * A week after sign-up with no workout logged: one short, plain email from the founder asking
 * what got in the way. It reads like a personal note (no banner or button) and replies go to
 * the contact address. What it says depends on how far they got.
 */
export function checkinEmail(d: CheckinData) {
  const first = d.displayName?.trim().split(/\s+/)[0] ?? null;
  const days = d.trainingDays?.length ? formatDays(d.trainingDays) : null;

  const where = d.splitName
    ? days
      ? `I saw you set up ${d.splitName} and planned to train on ${days}, but no workout has been logged yet.`
      : `I saw you set up ${d.splitName}, but no workout has been logged yet.`
    : d.hasSplit
      ? "I saw you started building a split, but no workout has been logged yet."
      : "I noticed you haven’t picked a split or logged a workout yet.";
  const offer = d.splitName
    ? "If the split isn’t quite right, tell me what you train and how many days a week and I’ll set one up for you."
    : "If you tell me what you train and how many days a week, I’ll set a split up for you so it’s ready next time you’re at the gym.";

  const paras = [
    first ? `Hi ${first},` : "Hi,",
    `I’m ${FOUNDER_NAME}, I built NotchLift. Thanks for signing up last week.`,
    where,
    "Was something confusing, missing, or was it just not the right week? Even a one-line reply helps me make it better. For example:",
    null, // the list
    offer,
  ];
  const reasons = ["Too busy this week", "Not sure how to use it", "Missing something I need", "I use something else"];

  const subject = "Quick question about NotchLift";
  const pStyle = "margin:0 0 14px;font-size:16px;line-height:24px;color:#16191b;";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background-color:#ffffff;font-family:${FONT};">
<div style="max-width:520px;">
${paras
  .map((t) =>
    t === null
      ? `<ul style="margin:0 0 14px;padding-left:20px;font-size:16px;line-height:24px;color:#16191b;">${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
      : `<p style="${pStyle}">${esc(t)}</p>`,
  )
  .join("\n")}
<p style="${pStyle}">${esc(FOUNDER_NAME)}<br>Founder, NotchLift<br><a href="${esc(d.siteUrl)}/train" style="color:#16191b;">${esc(d.siteUrl.replace(/^https?:\/\//, ""))}</a></p>
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#8a9095;">${esc(COMPANY_LINE)}</p>
</div>
</body>
</html>`;
  const text = [...paras.map((t) => (t === null ? reasons.map((r) => `- ${r}`).join("\n") : t)), `${FOUNDER_NAME}\nFounder, NotchLift\n${d.siteUrl}/train`].join("\n\n");
  return { subject, html, text };
}

/** "NotchLift <hello@notchlift.com>" → "Ben from NotchLift <hello@notchlift.com>". */
export function fromWithName(from: string, name: string): string {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  return `${name.replace(/[<>"]/g, "")} <${address}>`;
}
