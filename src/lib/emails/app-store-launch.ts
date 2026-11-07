import { APP_STORE_URL } from "../site";
import { emailLayout, esc, p } from "./layout";

/** Sent once to every member (who hasn't turned emails off) when the iPhone app launched. */
export function appStoreLaunchEmail(d: { displayName: string | null; siteUrl: string }) {
  const first = d.displayName?.trim().split(/\s+/)[0] ?? null;
  const hi = first ? `Hi ${esc(first)},` : "Hi,";
  const subject = "Setmodo is now on the App Store 📲";
  const html = emailLayout({
    title: subject,
    preheader: "Same account, same history. Now a proper iPhone app.",
    heading: "Setmodo is on the App Store",
    body:
      p(hi) +
      p("Quick one from me: Setmodo is now a proper iPhone app on the App Store.") +
      p("Sign in with the same account you already use and all your splits, workouts and history are there. Nothing to move or set up.") +
      `<ul style="margin:0 0 14px;padding-left:20px;font-size:16px;line-height:24px;color:#16191b;">
<li>Opens instantly from your home screen</li>
<li>Smoother logging between sets</li>
<li>Export and share workouts straight from the share sheet</li>
</ul>`,
    // Apple's badge, served from the site as a PNG (email clients don't show SVG).
    button: { label: "Download on the App Store", href: APP_STORE_URL, image: { src: `${d.siteUrl}/badges/app-store-black.png`, width: 180, height: 60 } },
    after:
      `<p style="margin:20px 0 0;font-size:15px;line-height:22px;color:#16191b;"><strong>One small favour:</strong> if Setmodo has helped your training, a quick rating on the App Store would massively help. Early ratings decide whether other gym-goers find it.</p>` +
      `<p style="margin:14px 0 0;font-size:15px;line-height:22px;color:#16191b;">On Android or a computer? Nothing changes: keep using <a href="${esc(d.siteUrl)}" style="color:#16191b;">setmodo.com</a> as normal.</p>` +
      `<p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #e0e3df;font-size:15px;line-height:22px;color:#16191b;">Thanks for being one of the first. Any feedback, just reply. I read every message.<br><br>Ben<br><span style="color:#6b7176;">Founder, Setmodo</span></p>`,
    footer: "You’re receiving this because you have a Setmodo account.",
  });
  const text = [
    first ? `Hi ${first},` : "Hi,",
    "Quick one from me: Setmodo is now a proper iPhone app on the App Store.",
    `Download it here: ${APP_STORE_URL}`,
    "Sign in with the same account you already use and all your splits, workouts and history are there. Nothing to move or set up.",
    "- Opens instantly from your home screen\n- Smoother logging between sets\n- Export and share workouts straight from the share sheet",
    "One small favour: if Setmodo has helped your training, a quick rating on the App Store would massively help. Early ratings decide whether other gym-goers find it.",
    `On Android or a computer? Nothing changes: keep using ${d.siteUrl} as normal.`,
    "Thanks for being one of the first. Any feedback, just reply. I read every message.\n\nBen\nFounder, Setmodo",
  ].join("\n\n");
  return { subject, html, text };
}
