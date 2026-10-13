"use client";

import { CONSENT_KEY, parseConsent, serializeConsent, type Consent } from "./consent";
import { trackingAllowed } from "./track";

/** Meta Pixel ID (public). Unset: no pixel and no banner. */
export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || undefined;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: unknown };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function readConsent(): Consent | null {
  if (!trackingAllowed()) return "denied";
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_KEY), Date.now());
  } catch {
    return null;
  }
}

export function saveConsent(value: Consent) {
  try {
    window.localStorage.setItem(CONSENT_KEY, serializeConsent(value, Date.now()));
  } catch {
    /* private mode: ask again next time */
  }
  window.dispatchEvent(new Event("nl-consent"));
}

/** Clears the choice so the banner shows again (the "change cookie choice" link). */
export function resetConsent() {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("nl-consent"));
}

/** Meta's standard loader, run only after consent. */
function load(): boolean {
  if (!PIXEL_ID) return false;
  if (window.fbq) return true;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  window.fbq = n;
  window._fbq = n;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  // No automatic button-click events: only the events we send ourselves.
  n("set", "autoConfig", false, PIXEL_ID);
  n("init", PIXEL_ID);
  return true;
}

/** Sends a standard event, only with consent. */
export function pixelEvent(name: "PageView" | "CompleteRegistration" | "Subscribe", params?: Record<string, unknown>) {
  if (readConsent() !== "granted" || !load()) return;
  if (params) window.fbq!("track", name, params);
  else window.fbq!("track", name);
}
