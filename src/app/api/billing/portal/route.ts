import { NextResponse } from "next/server";
import { stripeClient } from "@/lib/billing/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Opens Stripe's billing page: change card or plan, cancel, invoices. */
export async function POST(request: Request) {
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "Payments aren’t switched on yet." }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data } = await supabase.from("memberships").select("stripe_customer_id").maybeSingle();
  if (!data?.stripe_customer_id) return NextResponse.json({ error: "No subscription to manage yet." }, { status: 404 });
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${new URL(request.url).origin}/profile` });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Couldn’t open billing. Please try again." }, { status: 502 });
  }
}
