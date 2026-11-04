import { NextResponse } from "next/server";
import { revokeAppleAuthorization } from "@/lib/apple-revoke";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Called by the iOS app's delete sheet, just before the account is deleted, with a fresh
 * authorization code from Apple's sheet. Only for a signed-in member who signed in with Apple.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!data.user.identities?.some((i) => i.provider === "apple")) return NextResponse.json({ result: "not_apple" });

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 2000) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const result = await revokeAppleAuthorization(code);
  if (result !== "revoked") console.error(`apple-revoke: ${result}`);
  return NextResponse.json({ result }, { status: result === "revoked" ? 200 : result === "not_configured" ? 503 : 502 });
}
