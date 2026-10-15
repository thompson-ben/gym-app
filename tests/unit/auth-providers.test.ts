import { describe, expect, it } from "vitest";
import { inAppBrowser, isNewOAuthAccount, oauthReturnError, parseProviders, signupErrorMessage, signupErrorReason } from "@/lib/auth-providers";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_FACEBOOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 [FBAN/FBIOS;FBAV/480.0.0.40.104;FBBV/123;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/80]";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 Instagram 350.0.0.25.86 (iPhone15,3; iOS 18_0; en_GB; en-GB; scale=3.00; 1290x2796; 123456789)";
const ANDROID_INSTAGRAM = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";

describe("sign in with Apple / Google", () => {
  it("shows only the providers that are switched on, Apple first", () => {
    expect(parseProviders(undefined)).toEqual([]);
    expect(parseProviders("")).toEqual([]);
    expect(parseProviders(" Google , apple ")).toEqual(["apple", "google"]);
    expect(parseProviders("apple,github")).toEqual(["apple"]);
  });

  it("spots the Facebook and Instagram in-app browsers, where Google refuses to sign in", () => {
    expect(inAppBrowser(IPHONE_SAFARI)).toBeNull();
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(inAppBrowser(IPHONE_FACEBOOK)).toBe("facebook");
    expect(inAppBrowser(IPHONE_INSTAGRAM)).toBe("instagram");
    expect(inAppBrowser(ANDROID_INSTAGRAM)).toBe("instagram");
    expect(inAppBrowser(ANDROID_WEBVIEW)).toBe("other");
  });

  it("turns sign-up errors into a reason code and a plain message", () => {
    expect(signupErrorReason({ code: "weak_password", message: "Password should be at least 8 characters." })).toBe("weak_password");
    expect(signupErrorReason({ code: "email_address_invalid" })).toBe("invalid_email");
    expect(signupErrorReason({ message: "Unable to validate email address: invalid format" })).toBe("invalid_email");
    expect(signupErrorReason({ code: "user_already_exists" })).toBe("already_registered");
    expect(signupErrorReason({ code: "over_email_send_rate_limit", status: 429 })).toBe("rate_limited");
    expect(signupErrorReason({ message: "boom" })).toBe("other");
    expect(signupErrorMessage("already_registered")).toMatch(/Sign in instead/);
    expect(signupErrorMessage("other")).toMatch(/try again/);
  });

  it("tells a cancelled Apple / Google sign-in from a failed one", () => {
    expect(oauthReturnError(null, null)).toBeNull();
    expect(oauthReturnError("access_denied", "user cancelled")).toBe("oauth_cancelled");
    expect(oauthReturnError("user_cancelled_authorize", null)).toBe("oauth_cancelled");
    expect(oauthReturnError("server_error", "Unable to exchange external code")).toBe("oauth_failed");
  });

  it("counts an Apple / Google sign-in as a new account only when it was just created", () => {
    const now = new Date("2026-10-16T09:00:00Z");
    expect(isNewOAuthAccount({ created_at: "2026-10-16T08:59:00Z", app_metadata: { provider: "apple" } }, now)).toBe(true);
    expect(isNewOAuthAccount({ created_at: "2026-10-01T08:59:00Z", app_metadata: { provider: "google" } }, now)).toBe(false);
    expect(isNewOAuthAccount({ created_at: "2026-10-16T08:59:00Z", app_metadata: { provider: "email" } }, now)).toBe(false);
    expect(isNewOAuthAccount(null, now)).toBe(false);
  });
});
