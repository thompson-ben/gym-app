import type Stripe from "stripe";
import type { PlanId } from "./plans";
import { PLANS } from "./plans";

/** The parts of a Stripe subscription the database needs (pure; unit-tested). */
export type SubscriptionUpdate = {
  user: string | null;
  customer: string | null;
  subscription: string;
  stripeStatus: string;
  plan: PlanId | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const byLookupKey = new Map(Object.entries(PLANS).map(([id, p]) => [p.lookupKey, id as PlanId]));

export function subscriptionUpdate(sub: Stripe.Subscription): SubscriptionUpdate {
  const item = sub.items?.data?.[0];
  // Billing periods live on subscription items in current Stripe API versions.
  const periodEnd = item?.current_period_end ?? null;
  const user = typeof sub.metadata?.user_id === "string" && /^[0-9a-f-]{36}$/i.test(sub.metadata.user_id) ? sub.metadata.user_id : null;
  return {
    user,
    customer: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
    subscription: sub.id,
    stripeStatus: sub.status,
    plan: (item?.price?.lookup_key && byLookupKey.get(item.price.lookup_key)) || null,
    periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    // Scheduled cancellation (cancel_at) counts too: it ends at a set date.
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}

export function invoicePayment(inv: Stripe.Invoice) {
  const paidAt = inv.status_transitions?.paid_at ?? inv.created;
  return {
    customer: typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
    invoice: inv.id ?? "",
    amountPence: inv.amount_paid,
    currency: inv.currency,
    paidAt: new Date(paidAt * 1000).toISOString(),
  };
}
