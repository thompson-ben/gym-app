import { NextResponse } from "next/server";
import { MEMBERSHIP_COLUMNS, membershipState, type MembershipRow } from "@/lib/billing/membership";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { billingSecret, stripeClient } from "@/lib/billing/server";
import { supabaseAnon } from "@/lib/supabase/anon";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Starts Stripe Checkout for the signed-in user. Card details never touch NotchLift. */
export async function POST(request: Request) {
  const stripe = stripeClient();
  const secret = billingSecret();
  if (!stripe || !secret) return fail("Payments aren’t switched on yet. Please try again soon.", 503);

  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const email = claims?.claims?.email as string | undefined;
  if (!userId) return fail("Please sign in again.", 401);

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!isPlanId(body.plan)) return fail("Choose monthly or yearly.", 400);

  const { data: row } = await supabase.from("memberships").select(MEMBERSHIP_COLUMNS).maybeSingle();
  const state = membershipState(row as MembershipRow);
  if (state.kind === "free") return fail("You have free access, so there’s nothing to pay.", 409);
  if (state.kind === "paid") return fail("You’re already a member. Manage your subscription from Profile.", 409);

  try {
    let customer = (row as MembershipRow)?.stripe_customer_id ?? null;
    if (!customer) {
      const created = await stripe.customers.create({ email, metadata: { user_id: userId } }, { idempotencyKey: `customer-${userId}` });
      customer = created.id;
      const { error } = await supabaseAnon().rpc("billing_link_customer", { p_secret: secret, p_user: userId, p_customer: customer });
      if (error) throw error;
    }
    const prices = await stripe.prices.list({ lookup_keys: [PLANS[body.plan].lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) return fail("That plan isn’t available right now.", 503);

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: userId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: { metadata: { user_id: userId } },
      allow_promotion_codes: true,
      success_url: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/upgrade?plan=${body.plan}`,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return fail("Couldn’t start checkout. Please try again.", 502);
  }
}
