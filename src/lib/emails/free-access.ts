import { emailLayout, esc, p } from "./layout";

/** Invitation to join with free access (sent by the owner from the admin dashboard). */
export function freeAccessEmail(d: { email: string; inviterName: string | null; note: string | null; siteUrl: string }) {
  const who = d.inviterName ? esc(d.inviterName) : "The NotchLift team";
  const link = `${d.siteUrl}/sign-in?mode=sign-up&email=${encodeURIComponent(d.email)}`;
  const subject = d.inviterName ? `${d.inviterName} gave you free access to NotchLift` : "You’ve been given free access to NotchLift";
  const html = emailLayout({
    title: subject,
    preheader: "Plan your training, log every set and see your progress. No trial, no payment.",
    heading: "You’ve got free access",
    body:
      p(`${who} has given you free access to NotchLift, the workout planner and tracker. No trial and no payment: just create your account with this email address.`) +
      (d.note ? p(`“${esc(d.note)}”`, true) : "") +
      p("Plan your split, log every set with last session beside you, and see when it’s time to add weight."),
    button: { label: "Create my account", href: link },
    after: `<p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #e0e3df;font-size:13px;line-height:20px;color:#6b7176;">Use <strong>${esc(d.email)}</strong> when you sign up so your free access applies.</p>`,
    footer: "You’re receiving this because someone invited you to NotchLift. If you weren’t expecting it, you can ignore this email.",
  });
  const text = `${subject}\n\nNo trial and no payment: create your account with ${d.email}:\n${link}\n${d.note ? `\n“${d.note}”\n` : ""}`;
  return { subject, html, text };
}
