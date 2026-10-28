/**
 * Sign in with Apple inside the iOS app: Apple's own sheet (no web redirect, which can't come
 * back to the app's web view), then Apple's identity token is exchanged for a Supabase session.
 *
 * Apple gets the SHA-256 of a one-time nonce and Supabase the nonce itself, so a token can't be
 * replayed. Supabase's Apple provider must list the app's bundle ID among its Client IDs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const APP_BUNDLE_ID = "com.notchlift.app";

/** Lower-case hex SHA-256 of a string (pure, unit-tested). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A random one-time value for the sign-in request. */
export function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Apple's sheet reports a cancel as error 1001 (ASAuthorizationError.canceled). */
export function isAppleCancel(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /1001|cancel/i.test(text);
}

/** "  Sam ", " Smith" → "Sam Smith"; nothing usable → null. At most 60 characters, as profiles allow. */
export function appleDisplayName(givenName: string | null | undefined, familyName: string | null | undefined): string | null {
  const name = [givenName, familyName].map((s) => s?.trim()).filter(Boolean).join(" ");
  return name ? name.slice(0, 60) : null;
}

export type NativeAppleResult = { ok: true } | { ok: false; reason: "cancelled" | "failed" };

export async function nativeAppleSignIn(supabase: SupabaseClient): Promise<NativeAppleResult> {
  const nonce = randomNonce();
  let response;
  try {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    ({ response } = await SignInWithApple.authorize({
      clientId: APP_BUNDLE_ID,
      redirectURI: window.location.origin,
      scopes: "email name",
      nonce: await sha256Hex(nonce),
    }));
  } catch (error) {
    return { ok: false, reason: isAppleCancel(error) ? "cancelled" : "failed" };
  }
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: response.identityToken, nonce });
  if (error || !data.user) return { ok: false, reason: "failed" };

  // Apple shares the name only the first time, and not in the token: keep it if the profile has none.
  const name = appleDisplayName(response.givenName, response.familyName);
  if (name) await supabase.from("profiles").update({ display_name: name }).eq("id", data.user.id).is("display_name", null);
  return { ok: true };
}
