/**
 * First-party analytics helpers (pure, unit-tested).
 *
 * A "touch" is where a visitor came from: campaign tags in the link (utm_*), whether it was a
 * Facebook/Instagram ad click (fbclid present; the id itself is never kept), or the referring
 * site. It holds no identifier: everyone arriving from the same campaign has the same touch.
 */
import { scrubText } from "./monitoring";

export type Touch = {
  landing_path: string;
  referrer_host?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  from_meta_ad: boolean;
  first_seen_at: string;
};

export const TOUCH_COOKIE = "nl_src";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Paths whose visits count as marketing traffic (signed-in app screens never do). */
export function isPublicPath(path: string): boolean {
  return path === "/" || ["/sign-in", "/join/", "/s/", "/privacy", "/terms"].some((p) => path.startsWith(p));
}

/** Where this page view came from, or null for a direct visit with nothing to attribute. */
export function readTouch(url: URL, referrer: string, ownHost: string, now: Date): Touch | null {
  const touch: Touch = { landing_path: scrubText(url.pathname).slice(0, 200), from_meta_ad: url.searchParams.has("fbclid"), first_seen_at: now.toISOString() };
  for (const key of UTM) {
    const v = url.searchParams.get(key)?.trim();
    if (v) touch[key] = v.slice(0, key === "utm_source" || key === "utm_medium" ? 100 : 150);
  }
  try {
    const host = referrer ? new URL(referrer).hostname.toLowerCase() : "";
    if (host && host !== ownHost.toLowerCase()) touch.referrer_host = host.slice(0, 120);
  } catch {
    /* malformed referrer */
  }
  // Links people share from the app, when they carry no campaign tags of their own.
  if (!touch.utm_source && !touch.referrer_host) {
    if (url.pathname.startsWith("/join/")) touch.utm_source = "group-invite";
    else if (url.pathname.startsWith("/s/")) touch.utm_source = "split-share";
  }
  const attributable = touch.utm_source || touch.utm_campaign || touch.from_meta_ad || touch.referrer_host;
  return attributable ? touch : null;
}

export function deviceFromUserAgent(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

export function isBot(ua: string): boolean {
  return !ua || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|lighthouse|curl|wget|python-requests/i.test(ua);
}

export function encodeTouch(t: Touch): string {
  return encodeURIComponent(JSON.stringify(t)).slice(0, 1800);
}

export function decodeTouch(raw: string | undefined | null): Touch | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(decodeURIComponent(raw)) as Touch;
    return t && typeof t === "object" && typeof t.landing_path === "string" ? t : null;
  } catch {
    return null;
  }
}
