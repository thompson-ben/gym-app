/**
 * Consent for advertising measurement (the Meta Pixel). Nothing loads until a visitor accepts on
 * the banner; browsers sending Global Privacy Control or Do Not Track count as a "no" and are
 * never asked. The choice is kept in this browser only.
 */
export type Consent = "granted" | "denied";

export const CONSENT_KEY = "nl_consent";
/** Ask again after six months. */
export const CONSENT_MAX_AGE_MS = 182 * 86_400_000;

export function parseConsent(raw: string | null, now: number): Consent | null {
  if (!raw) return null;
  const [value, at] = raw.split(":");
  if ((value !== "granted" && value !== "denied") || !Number(at) || now - Number(at) > CONSENT_MAX_AGE_MS) return null;
  return value;
}

export const serializeConsent = (value: Consent, now: number) => `${value}:${now}`;

/** Whether to show the banner: only when there is a pixel, no choice yet, and no opt-out signal. */
export function shouldAsk(opts: { pixelId: string | undefined; consent: Consent | null; optOutSignal: boolean; publicPage: boolean }): boolean {
  return Boolean(opts.pixelId) && opts.publicPage && opts.consent === null && !opts.optOutSignal;
}
