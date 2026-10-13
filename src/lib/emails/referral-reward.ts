import { REFERRAL_DAYS } from "../referral";
import { emailLayout, esc, p } from "./layout";

/** Sent once a friend someone invited has started training: their trial got 14 more days. */
export function referralRewardEmail(d: { displayName: string | null; trialEndsAt: string; siteUrl: string; timeZone?: string }) {
  const hi = d.displayName ? `Hi ${esc(d.displayName)},` : "Hi,";
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: d.timeZone ?? "Europe/London" }).format(new Date(d.trialEndsAt));
  const subject = `You’ve got ${REFERRAL_DAYS} more days of NotchLift`;
  const html = emailLayout({
    title: subject,
    preheader: `A friend you invited has started training. Your free trial now runs until ${date}.`,
    heading: `${REFERRAL_DAYS} more days, on us`,
    body:
      p(hi) +
      p(`A friend you invited to NotchLift has logged their first workout. Thanks for sharing it.`) +
      p(`As promised, your free trial has <strong>${REFERRAL_DAYS} more days</strong>: it now runs until <strong>${esc(date)}</strong>.`),
    button: { label: "Open NotchLift", href: `${d.siteUrl}/train` },
    footer: "You’re receiving this because a friend joined NotchLift with your invite.",
  });
  const text = `${hi}\n\nA friend you invited to NotchLift has logged their first workout. Thanks for sharing it.\n\nYour free trial has ${REFERRAL_DAYS} more days: it now runs until ${date}.\n\n${d.siteUrl}/train`;
  return { subject, html, text };
}
