import "server-only";
import { COMPANY_LINE, CONTACT_EMAIL } from "../company";

/** Sends an email through Resend's API. Replies go to the contact address; every email carries the company details. Returns false (never throws) when it can't. */
export async function sendEmail(to: string, msg: { subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "NotchLift <hello@notchlift.com>",
        reply_to: CONTACT_EMAIL,
        to: [to],
        subject: msg.subject,
        html: msg.html,
        text: `${msg.text}\n\nQuestions? Reply to this email or write to ${CONTACT_EMAIL}.\n\n${COMPANY_LINE}`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
