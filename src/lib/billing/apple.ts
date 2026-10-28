/**
 * App Store subscriptions through RevenueCat (pure, unit-tested). The iOS app buys the
 * products below; RevenueCat grants the "pro" entitlement and tells the server through its
 * webhook, and the server applies RevenueCat's view of the subscriber to the membership.
 * The RevenueCat app user ID is the NotchLift user ID.
 */

import type { PlanId } from "./plans";

/** App Store Connect product IDs (same names as the Stripe price lookup keys). */
export const APPLE_PRODUCTS: Record<PlanId, string> = { monthly: "notchlift_monthly", yearly: "notchlift_yearly" };
export const ENTITLEMENT = "pro";

/** "notchlift_yearly" (or RevenueCat's "notchlift_yearly:…" form) → "yearly". */
export function applePlan(productId: string | null | undefined): PlanId | null {
  const id = (productId ?? "").toLowerCase();
  if (/year|annual/.test(id)) return "yearly";
  if (/month/.test(id)) return "monthly";
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The NotchLift user an event is about: the app user ID, or an alias if RevenueCat merged an anonymous one. */
export function eventUserId(event: { app_user_id?: string | null; original_app_user_id?: string | null; aliases?: string[] | null }): string | null {
  for (const id of [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]) {
    if (id && UUID.test(id)) return id.toLowerCase();
  }
  return null;
}

type Subscription = {
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
};
/** The parts of RevenueCat's GET /v1/subscribers/{id} response that matter here. */
export type RevenueCatSubscriber = {
  entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null; product_identifier?: string | null }>;
  subscriptions?: Record<string, Subscription>;
};

export type AppleSubscriptionState = { active: boolean; plan: PlanId | null; expiresAt: string | null; willRenew: boolean; billingIssue: boolean };

/** Whether the subscriber has NotchLift now, on which plan, until when, and whether it renews. */
export function appleSubscriptionState(subscriber: RevenueCatSubscriber | null | undefined, now: Date = new Date()): AppleSubscriptionState {
  const ent = subscriber?.entitlements?.[ENTITLEMENT];
  const inactive: AppleSubscriptionState = { active: false, plan: null, expiresAt: null, willRenew: false, billingIssue: false };
  if (!ent) return inactive;
  const until = [ent.expires_date, ent.grace_period_expires_date].filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
  const active = !ent.expires_date || (until !== null && new Date(until).getTime() > now.getTime());
  const sub = ent.product_identifier ? subscriber?.subscriptions?.[ent.product_identifier] : undefined;
  return {
    active,
    plan: applePlan(ent.product_identifier),
    expiresAt: ent.expires_date ?? null,
    willRenew: !sub?.unsubscribe_detected_at && !sub?.refunded_at,
    billingIssue: Boolean(sub?.billing_issues_detected_at),
  };
}

/** A RevenueCat webhook event (the fields used). */
export type RevenueCatEvent = {
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  transaction_id?: string | null;
  environment?: string | null;
  store?: string | null;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  purchased_at_ms?: number | null;
  cancel_reason?: string | null;
};

/** A real App Store payment to record for the dashboard (never a sandbox or TestFlight one). */
export function applePayment(e: RevenueCatEvent): { transaction: string; pence: number; currency: string; plan: PlanId | null; paidAt: string } | null {
  if (!["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"].includes(e.type ?? "")) return null;
  if (e.environment !== "PRODUCTION" || e.store !== "APP_STORE") return null;
  if (!e.transaction_id || typeof e.price_in_purchased_currency !== "number" || !/^[A-Za-z]{3}$/.test(e.currency ?? "")) return null;
  return {
    transaction: e.transaction_id,
    pence: Math.max(0, Math.round(e.price_in_purchased_currency * 100)),
    currency: e.currency!.toLowerCase(),
    plan: applePlan(e.product_id),
    paidAt: new Date(e.purchased_at_ms ?? Date.now()).toISOString(),
  };
}

/** Apple refunded this transaction (RevenueCat reports a refund as a customer-support cancellation). */
export const isAppleRefund = (e: RevenueCatEvent) => e.type === "CANCELLATION" && e.cancel_reason === "CUSTOMER_SUPPORT" && Boolean(e.transaction_id);
