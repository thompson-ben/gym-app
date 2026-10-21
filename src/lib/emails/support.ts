import { emailLayout, esc, p } from "./layout";

/** Message text as email paragraphs: escaped, blank lines split paragraphs, single newlines kept. */
function paras(body: string) {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((para) => p(esc(para).replace(/\n/g, "<br>")))
    .join("");
}

/** To the member: someone replied to their support message. Includes the reply. */
export function supportReplyEmail(d: { displayName: string | null; subject: string; reply: string; fromName: string | null; threadUrl: string }) {
  const from = d.fromName ? `${d.fromName.trim().split(/\s+/)[0]} from NotchLift` : "NotchLift support";
  const subject = `Re: ${d.subject}`;
  const hi = d.displayName ? `Hi ${d.displayName.trim().split(/\s+/)[0]},` : "Hi,";
  const html = emailLayout({
    title: subject,
    preheader: `${from} replied to your message.`,
    heading: "You have a reply",
    body: p(esc(hi)) + p(`${esc(from)} replied to <strong>${esc(d.subject)}</strong>:`, true) + `<div style="margin:0 0 6px;padding:16px 18px 2px;border-left:4px solid #c3ed89;background-color:#f6f7f5;border-radius:8px;">${paras(d.reply)}</div>`,
    button: { label: "Reply in NotchLift", href: d.threadUrl },
    after: p("Replying in the app keeps everything in one place.", true).replace("margin:0 0 14px", "margin:16px 0 0"),
    footer: "You’re receiving this because you sent us a message from NotchLift.",
  });
  const text = `${hi}\n\n${from} replied to "${d.subject}":\n\n${d.reply.trim()}\n\nReply in NotchLift: ${d.threadUrl}`;
  return { subject, html, text };
}

/** To the support inbox: a member started a thread or replied. */
export function supportNoticeEmail(d: { email: string; displayName: string | null; subject: string; topic: string; body: string; isReply: boolean; adminUrl: string }) {
  const who = d.displayName ? `${d.displayName} (${d.email})` : d.email;
  const subject = `${d.isReply ? "Support reply" : "New support message"}: ${d.subject}`;
  const html = emailLayout({
    title: subject,
    preheader: `${who}: ${d.body.slice(0, 80)}`,
    heading: d.isReply ? "They replied" : "New support message",
    body: p(`<strong>${esc(who)}</strong> · ${esc(d.topic)}`, true) + p(`<strong>${esc(d.subject)}</strong>`) + paras(d.body),
    button: { label: "Open in Admin", href: d.adminUrl },
    after: p("Reply from Admin → Support so the conversation is saved and they’re notified. Replying to this email won’t reach them.", true).replace("margin:0 0 14px", "margin:16px 0 0"),
    footer: "Sent to the NotchLift contact address for every support message.",
  });
  const text = `${who} · ${d.topic}\n\n${d.subject}\n\n${d.body.trim()}\n\nOpen in Admin: ${d.adminUrl}\n\nReply from Admin → Support so it’s saved and they’re notified.`;
  return { subject, html, text };
}
