import { NextResponse } from "next/server";
import { appStoreConfigured, syncAppleSubscription } from "@/lib/billing/revenuecat";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The iOS app calls this right after a purchase or restore, so the membership updates at once
 * rather than waiting for RevenueCat's webhook. It only ever reads RevenueCat's own record of
 * the signed-in user, so nothing the app sends can grant access.
 */
export async function POST() {
  if (!appStoreConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = await syncAppleSubscription(userId);
  if (result === "error") return NextResponse.json({ error: "Couldn’t check your purchase. Please try again." }, { status: 502 });
  return NextResponse.json({ result });
}
