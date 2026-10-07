import { PLANS, YEARLY_PER_MONTH, YEARLY_SAVING_PCT } from "../billing/plans";
import { emailLayout, esc, p } from "./layout";

/** Sent to early-access members at launch: their 14-day trial starts now. */
export function launchEmail(d: { displayName: string | null; trialEndsAt: string; trialDays: number; siteUrl: string; timeZone?: string }) {
  const hi = d.displayName ? `Hi ${esc(d.displayName)},` : "Hi,";
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: d.timeZone ?? "Europe/London" }).format(new Date(d.trialEndsAt));
  const subject = `NotchLift membership is here: your ${d.trialDays} free days start today`;
  const html = emailLayout({
    title: subject,
    preheader: `Thanks for training with NotchLift early. Everything you’ve logged stays yours.`,
    heading: "Thanks for being early",
    body:
      p(hi) +
      p("Thank you for using NotchLift while it was in early access. Your feedback and workouts helped shape it.") +
      p(
        `Today NotchLift membership launches. You have <strong>${d.trialDays} days free</strong> from today, until ${esc(date)}, with everything as it is now. After that it’s <strong>${PLANS.yearly.price} a year</strong> (${YEARLY_PER_MONTH} a month, ${YEARLY_SAVING_PCT}% less than monthly) or ${PLANS.monthly.price} a month.`,
      ),
    button: { label: "See plans", href: `${d.siteUrl}/upgrade` },
    after: `<p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #e0e3df;font-size:13px;line-height:20px;color:#6b7176;">Nothing you’ve logged will ever be deleted for not paying. Your history and progress stay in your account and you can export them any time.</p>`,
    footer: "You’re receiving this because you have a NotchLift account from early access.",
  });
  const text = `${hi}\n\nThank you for using NotchLift in early access. Membership launches today: you have ${d.trialDays} days free, until ${date}. After that it’s ${PLANS.yearly.price} a year (${YEARLY_PER_MONTH} a month) or ${PLANS.monthly.price} a month.\n\nSee plans: ${d.siteUrl}/upgrade\n\nNothing you’ve logged will ever be deleted for not paying.`;
  return { subject, html, text };
}
