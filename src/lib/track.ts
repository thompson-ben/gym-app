"use client";

import { TOUCH_COOKIE, encodeTouch, readTouch, type Touch } from "./attribution";

/** Browsers asking not to be tracked (Global Privacy Control or Do Not Track) are left alone. */
export function trackingAllowed(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return !nav.globalPrivacyControl && nav.doNotTrack !== "1";
}

function once(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

type EventName = "visit" | "signup_view" | "pricing_view" | "signup_submit" | "signup_error" | "oauth_start" | DemoEvent;
export type DemoEvent = "demo_start" | "demo_set" | "demo_signup";

function send(name: EventName, props: Partial<Touch> & { path?: string; detail?: string }) {
  const body = JSON.stringify({ name, props });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through */
  }
  void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
}

export function getTouchCookie(): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|; )${TOUCH_COOKIE}=([^;]*)`))?.[1];
}

export function clearTouchCookie() {
  document.cookie = `${TOUCH_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Called on each public page: remembers the first campaign that brought this browser (30 days,
 * until sign-up) and records one anonymous visit per browser tab session.
 */
export function trackPageView() {
  if (!trackingAllowed()) return;
  const url = new URL(window.location.href);
  const touch = readTouch(url, document.referrer, window.location.host, new Date());
  // First touch wins, except that a friend's invite link replaces it (so they get the credit).
  if (touch && (!getTouchCookie() || touch.ref)) {
    document.cookie = `${TOUCH_COOKIE}=${encodeTouch(touch)}; path=/; max-age=${30 * 86400}; samesite=lax; secure`;
  }
  if (once("nl_visit")) {
    const { landing_path, first_seen_at: _ignored, ...rest } = touch ?? { landing_path: url.pathname, first_seen_at: "" };
    void _ignored;
    send("visit", { ...rest, path: landing_path ?? url.pathname });
  }
}

/** The landing page's pricing section came into view (once per tab session). */
export function trackPricingView() {
  if (!trackingAllowed() || !once("nl_pricing_view")) return;
  send("pricing_view", { path: window.location.pathname });
}

/** Someone opened the create-account form (once per tab session). */
export function trackSignupView() {
  if (!trackingAllowed() || !once("nl_signup_view")) return;
  send("signup_view", { path: "/sign-in" });
}

/**
 * A step in creating an account: tapped Create account, tapped Continue with Apple / Google, or
 * why it didn't go through (a reason code, never what was typed). Each once per tab session.
 */
export function trackSignupStep(name: "signup_submit" | "signup_error" | "oauth_start", detail?: string) {
  if (!trackingAllowed() || !once(`nl_${name}_${detail ?? ""}`)) return;
  send(name, { path: "/sign-in", detail });
}

/** The "Try a workout" demo: opened it, ticked a first set, tapped create account. Each once per tab session. */
export function trackDemo(name: DemoEvent) {
  if (!trackingAllowed() || !once(`nl_${name}`)) return;
  send(name, { path: "/try" });
}
