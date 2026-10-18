import "server-only";
import { COMPANY_LINE, CONTACT_EMAIL } from "../company";
import { fromWithName } from "./checkin";
import { withUnsubscribeFooter } from "./unsubscribe";

/**
 * Sends an email through Resend's API. Replies go to the contact address; every email carries
 * the company details. Reminder emails pass `unsubscribe` links: a footer link and the
 * one-click List-Unsubscribe headers mail apps show. `fromName` replaces the sender's display
 * name (same address), for the personal check-in. Returns false (never throws) when it can't.
 */
export async function sendEmail(
  to: string,
  msg: { subject: string; html: string; text: string },
  unsubscribe?: { pageUrl: string; oneClickUrl: string },
  opts: { fromName?: string } = {},
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.EMAIL_FROM ?? "NotchLift <hello@notchlift.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: opts.fromName ? fromWithName(from, opts.fromName) : from,
        reply_to: CONTACT_EMAIL,
        to: [to],
        subject: msg.subject,
        html: unsubscribe ? withUnsubscribeFooter(msg.html, unsubscribe.pageUrl) : msg.html,
        text: `${msg.text}\n\nQuestions? Reply to this email or write to ${CONTACT_EMAIL}.${unsubscribe ? `\n\nDon’t want reminder emails? Unsubscribe: ${unsubscribe.pageUrl}` : ""}\n\n${COMPANY_LINE}`,
        ...(unsubscribe
          ? {
              headers: {
                "List-Unsubscribe": `<${unsubscribe.oneClickUrl}>, <mailto:${CONTACT_EMAIL}?subject=unsubscribe>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
