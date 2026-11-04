/**
 * Deleting an account made with Sign in with Apple must also revoke it with Apple (App Store
 * guideline 5.1.1(v)), so it disappears from the person's "Sign in with Apple" list. In the iOS
 * app the delete sheet asks Apple for a fresh authorization code; the server exchanges it for
 * a refresh token and revokes that, signing as the app with the Sign in with Apple key.
 *
 * Server only: needs APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8 file's text).
 */

import { createPrivateKey, sign } from "node:crypto";
import { APP_BUNDLE_ID } from "./native-apple";

const APPLE = "https://appleid.apple.com";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** The .p8 key as stored in an environment variable: real newlines, or "\n" escapes. */
export const normalisePrivateKey = (raw: string) => raw.replace(/\\n/g, "\n").trim();

/** The short-lived ES256 client secret Apple expects in place of a password (pure, unit-tested). */
export function appleClientSecret(opts: { teamId: string; keyId: string; privateKey: string; clientId: string; now?: number }): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: opts.keyId }));
  const claims = b64url(JSON.stringify({ iss: opts.teamId, iat, exp: iat + 300, aud: APPLE, sub: opts.clientId }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(normalisePrivateKey(opts.privateKey)),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${b64url(signature)}`;
}

function config() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null;
}

export const appleRevokeConfigured = () => config() !== null;

/** Exchanges an authorization code from the app's Apple sheet and revokes the result. */
export async function revokeAppleAuthorization(code: string): Promise<"revoked" | "failed" | "not_configured"> {
  const c = config();
  if (!c) return "not_configured";
  const clientSecret = appleClientSecret({ ...c, clientId: APP_BUNDLE_ID });
  const form = (fields: Record<string, string>) => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: APP_BUNDLE_ID, client_secret: clientSecret, ...fields }),
  });

  const tokenRes = await fetch(`${APPLE}/auth/token`, form({ grant_type: "authorization_code", code }));
  if (!tokenRes.ok) return "failed";
  const tokens = (await tokenRes.json().catch(() => null)) as { refresh_token?: string; access_token?: string } | null;
  const token = tokens?.refresh_token ?? tokens?.access_token;
  if (!token) return "failed";

  const revokeRes = await fetch(
    `${APPLE}/auth/revoke`,
    form({ token, token_type_hint: tokens?.refresh_token ? "refresh_token" : "access_token" }),
  );
  return revokeRes.ok ? "revoked" : "failed";
}
