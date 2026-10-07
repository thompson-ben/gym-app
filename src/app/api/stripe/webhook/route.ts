import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { invoicePayment, subscriptionUpdate } from "@/lib/billing/stripe-events";
import { billingSecret, stripeClient } from "@/lib/billing/server";
import { supabaseAnon } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/**
 * Stripe → NotchLift. Every request is verified with the webhook signing secret. Failures
 * answer 500 so Stripe retries; events the app doesn't use answer 200.
 */
export async function POST(request: Request) {
  const stripe = stripeClient();
  const secret = billingSecret();
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret || !signingSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, request.headers.get("stripe-signature") ?? "", signingSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = supabaseAnon();
  const at = new Date(event.created * 1000).toISOString();

  async function apply(sub: Stripe.Subscription, deleted = false) {
    const u = subscriptionUpdate(sub);
    const { error } = await db.rpc("billing_apply_subscription", {
      p_secret: secret,
      p_user: u.user,
      p_customer: u.customer,
      p_subscription: u.subscription,
      p_stripe_status: deleted ? "canceled" : u.stripeStatus,
      p_plan: u.plan,
      p_period_end: u.periodEnd,
      p_cancel_at_period_end: u.cancelAtPeriodEnd,
      p_event_at: at,
    });
    // The account was deleted: nothing left to update.
    if (error && !error.message.includes("billing_user_not_found")) throw error;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await apply(event.data.object);
        break;
      case "customer.subscription.deleted":
        await apply(event.data.object, true);
        break;
      case "checkout.session.completed": {
        // Apply straight away so the success page can confirm without waiting for later events.
        const id = event.data.object.subscription;
        if (typeof id === "string") await apply(await stripe.subscriptions.retrieve(id));
        break;
      }
      case "invoice.paid": {
        const p = invoicePayment(event.data.object);
        if (p.amountPence > 0 && p.invoice) {
          const { error } = await db.rpc("billing_record_payment", {
            p_secret: secret,
            p_customer: p.customer,
            p_invoice: p.invoice,
            p_amount_pence: p.amountPence,
            p_currency: p.currency,
            p_plan: null,
            p_paid_at: p.paidAt,
          });
          if (error) throw error;
        }
        break;
      }
      default:
        break;
    }
  } catch {
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
