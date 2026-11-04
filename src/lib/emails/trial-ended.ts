import { emailLayout, esc, p } from "./layout";

/** Sent once, a day or so after a trial ends without a plan: everything is safe, and one question. */
export function trialEndedEmail(d: { displayName: string | null; workouts: number; siteUrl: string }) {
  const hi = d.displayName ? `Hi ${esc(d.displayName)},` : "Hi,";
  const logged = d.workouts === 1 ? "the workout you logged is" : d.workouts > 1 ? `the ${d.workouts} workouts you logged are` : "your splits are";
  const subject = "Your Setmodo trial has ended: one quick question";
  const link = `${d.siteUrl}/upgrade?reason=trial_ended#why`;
  const html = emailLayout({
    title: subject,
    preheader: "What stopped you from choosing a plan? One tap, and it really helps.",
    heading: "What stopped you?",
    body:
      p(hi) +
      p(`Your free trial of Setmodo has ended. Nothing is lost: ${logged} still there, and you can export everything any time.`) +
      p(`I’m building Setmodo on my own, so I’d really like to know what stopped you from choosing a plan. It takes one tap. Or just reply to this email; I read every reply.`),
    button: { label: "Answer in one tap", href: link },
    footer: "You’re receiving this once because your Setmodo free trial has ended.",
  });
  const text = `${hi}\n\nYour free trial of Setmodo has ended. Nothing is lost: ${logged} still there, and you can export everything any time.\n\nI’m building Setmodo on my own, so I’d really like to know what stopped you from choosing a plan. It takes one tap:\n${link}\n\nOr just reply to this email; I read every reply.`;
  return { subject, html, text };
}
