/**
 * Sign in with Apple / Google helpers (pure, unit-tested).
 *
 * A provider's button only shows once it's listed in the AUTH_PROVIDERS environment variable
 * (e.g. "apple,google"), which is set after the provider has been switched on in Supabase.
 */

export type OAuthProvider = "apple" | "google";
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["apple", "google"];
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { apple: "Apple", google: "Google" };

/** "apple, Google" → ["apple", "google"], always in the order Apple, Google. */
export function parseProviders(value: string | undefined): OAuthProvider[] {
  const listed = new Set((value ?? "").split(",").map((s) => s.trim().toLowerCase()));
  return OAUTH_PROVIDERS.filter((p) => listed.has(p));
}

export type InApp = "facebook" | "instagram" | "other";

/**
 * Whether the page is open inside another app's built-in browser. Google refuses to sign in
 * there ("disallowed_useragent"); Apple and email work.
 */
export function inAppBrowser(ua: string): InApp | null {
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|MessengerForiOS/i.test(ua)) return "facebook";
  if (/musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Twitter for|Line\/|; wv\)/i.test(ua)) return "other";
  return null;
}

export const IN_APP_NAME: Record<InApp, string> = { facebook: "Facebook", instagram: "Instagram", other: "this app" };

/** Short reason codes for the sign-up drop-off chart. Never includes what was typed. */
export type SignupErrorReason =
  | "invalid_email"
  | "short_password"
  | "weak_password"
  | "already_registered"
  | "rate_limited"
  | "network"
  | "oauth_cancelled"
  | "oauth_failed"
  | "other";

export function signupErrorReason(error: { code?: string; message?: string; status?: number } | null | undefined): SignupErrorReason {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "weak_password" || message.includes("password should")) return "weak_password";
  if (code === "email_address_invalid" || code === "validation_failed" || (message.includes("invalid") && message.includes("email"))) return "invalid_email";
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered")) return "already_registered";
  if (code.startsWith("over_") || error?.status === 429 || message.includes("rate limit")) return "rate_limited";
  return "other";
}

/** What to tell someone whose sign-up didn't go through. */
export function signupErrorMessage(reason: SignupErrorReason): string {
  switch (reason) {
    case "invalid_email":
      return "That email address doesn't look right. Please check it and try again.";
    case "short_password":
      return "Your password needs at least 8 characters.";
    case "weak_password":
      return "Please choose a stronger password: at least 8 characters, not a common one.";
    case "already_registered":
      return "There's already an account with that email. Sign in instead, or reset your password.";
    case "rate_limited":
      return "Too many attempts just now. Please wait a minute and try again.";
    case "network":
      return "Could not reach the server. Check your connection and try again.";
    case "oauth_cancelled":
      return "Sign-in was cancelled. Choose an option below to continue.";
    case "oauth_failed":
      return "That sign-in didn't work. Please try again, or use your email instead.";
    default:
      return "Something went wrong creating your account. Please try again.";
  }
}

/** The provider's error on the way back, e.g. the person tapped Cancel on Apple's sheet. */
export function oauthReturnError(error: string | null, description: string | null): "oauth_cancelled" | "oauth_failed" | null {
  if (!error) return null;
  const text = `${error} ${description ?? ""}`.toLowerCase();
  return text.includes("access_denied") || text.includes("cancel") ? "oauth_cancelled" : "oauth_failed";
}

/** Set for a few minutes after an account is created with Apple or Google (read by AttributionSync). */
export const NEW_OAUTH_COOKIE = "nl_new_oauth";

/**
 * Whether an account that has just signed in with Apple or Google was created by this sign-in
 * (so the Meta "CompleteRegistration" event is sent once, for new accounts only).
 */
export function isNewOAuthAccount(user: { created_at?: string; app_metadata?: { provider?: string } } | null, now: Date): boolean {
  const provider = user?.app_metadata?.provider;
  if (!user?.created_at || !provider || provider === "email") return false;
  return now.getTime() - new Date(user.created_at).getTime() < 10 * 60_000;
}
