import { NextResponse } from "next/server";
import { stripeClient } from "@/lib/billing/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cancels the signed-in user's subscription immediately. Used just before account deletion so
 * nobody keeps being charged for an account that no longer exists.
 */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data } = await supabase.from("memberships").select("status, stripe_subscription_id").maybeSingle();
  if (!data?.stripe_subscription_id || data.status !== "paid") return NextResponse.json({ cancelled: false });
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "Couldn’t reach billing to cancel your subscription. Please try again." }, { status: 503 });
  try {
    await stripe.subscriptions.cancel(data.stripe_subscription_id);
    return NextResponse.json({ cancelled: true });
  } catch (e) {
    // Already cancelled in Stripe: fine.
    if ((e as { code?: string }).code === "resource_missing") return NextResponse.json({ cancelled: true });
    return NextResponse.json({ error: "Couldn’t cancel your subscription. Nothing was deleted; please try again." }, { status: 502 });
  }
}
