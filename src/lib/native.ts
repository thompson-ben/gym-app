/**
 * The iOS app (capacitor.config.ts) loads this site in a native shell and adds "NotchLiftApp/<n>"
 * to the user agent. These helpers tell the site it's running there (pure, unit-tested), for
 * hiding web-only things like "Add to Home Screen" and, later, using native features.
 */

export const NATIVE_APP_UA = /\bNotchLiftApp\/\d+/;

/** Whether a user agent (from a request's headers, or navigator.userAgent) is the iOS app. */
export function isNativeAppUserAgent(ua: string | null | undefined): boolean {
  return NATIVE_APP_UA.test(ua ?? "");
}

/** In the browser: whether this page is running inside the iOS app. */
export function isNativeApp(): boolean {
  return typeof navigator !== "undefined" && isNativeAppUserAgent(navigator.userAgent);
}
