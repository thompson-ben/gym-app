import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links for reminder emails. The signature proves the link came from one of
 * our emails for that account, so it works without signing in and can't be forged for anyone
 * else. Keyed off BILLING_SECRET with its own label, so it can't be reused for anything else.
 */
function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`notchlift-unsubscribe:${userId}`).digest("base64url").slice(0, 32);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function unsubscribeToken(userId: string, secret: string): string {
  return sign(userId, secret);
}

export function verifyUnsubscribe(userId: string | null | undefined, token: string | null | undefined, secret: string | null): boolean {
  if (!secret || !userId || !token || !UUID.test(userId)) return false;
  const expected = Buffer.from(sign(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The page people open from the email (asks before unsubscribing, so link scanners can't). */
export function unsubscribePageUrl(siteUrl: string, userId: string, secret: string): string {
  return `${siteUrl}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId, secret)}`;
}

/** The one-click address mail apps POST to (RFC 8058). */
export function unsubscribeOneClickUrl(siteUrl: string, userId: string, secret: string): string {
  return `${siteUrl}/api/unsubscribe?u=${userId}&t=${unsubscribeToken(userId, secret)}`;
}

/** A footer line linking to the unsubscribe page, placed just before </body>. */
export function withUnsubscribeFooter(html: string, pageUrl: string): string {
  const line = `<p style="margin:0;padding:0 16px 32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8a9095;">Don’t want reminder emails? <a href="${pageUrl.replace(/&/g, "&amp;")}" style="color:#8a9095;text-decoration:underline;">Unsubscribe</a>.</p>`;
  return html.includes("</body>") ? html.replace("</body>", `${line}</body>`) : html + line;
}
