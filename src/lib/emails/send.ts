import "server-only";

/** Sends an email through Resend's API. Returns false (never throws) when it can't. */
export async function sendEmail(to: string, msg: { subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "NotchLift <hello@notchlift.com>", to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
