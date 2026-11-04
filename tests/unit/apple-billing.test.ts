import { describe, expect, it } from "vitest";
import { applePayment, applePlan, appleSubscriptionState, eventUserId, isAppleRefund } from "@/lib/billing/apple";

const now = new Date("2026-11-01T12:00:00Z");
const user = "0b6f1c1e-2f4a-4c3b-9d7e-1a2b3c4d5e6f";

describe("App Store subscriptions", () => {
  it("maps products to plans", () => {
    expect(applePlan("notchlift_yearly")).toBe("yearly");
    expect(applePlan("notchlift_monthly")).toBe("monthly");
    expect(applePlan("something")).toBeNull();
    expect(applePlan(null)).toBeNull();
  });

  it("finds the NotchLift user behind an event", () => {
    expect(eventUserId({ app_user_id: user })).toBe(user);
    expect(eventUserId({ app_user_id: "$RCAnonymousID:abc", aliases: ["$RCAnonymousID:abc", user.toUpperCase()] })).toBe(user);
    expect(eventUserId({ app_user_id: "$RCAnonymousID:abc" })).toBeNull();
  });

  it("reads whether the subscription is active, until when, and whether it renews", () => {
    const subscriber = {
      entitlements: { pro: { expires_date: "2026-12-01T12:00:00Z", product_identifier: "notchlift_monthly" } },
      subscriptions: { notchlift_monthly: { expires_date: "2026-12-01T12:00:00Z", unsubscribe_detected_at: null, billing_issues_detected_at: null } },
    };
    expect(appleSubscriptionState(subscriber, now)).toEqual({ active: true, plan: "monthly", expiresAt: "2026-12-01T12:00:00Z", willRenew: true, billingIssue: false });

    const cancelling = { ...subscriber, subscriptions: { notchlift_monthly: { unsubscribe_detected_at: "2026-11-01T10:00:00Z" } } };
    expect(appleSubscriptionState(cancelling, now)).toMatchObject({ active: true, willRenew: false });

    const expired = { entitlements: { pro: { expires_date: "2026-10-01T12:00:00Z", product_identifier: "notchlift_yearly" } } };
    expect(appleSubscriptionState(expired, now)).toMatchObject({ active: false, plan: "yearly" });

    // In Apple's billing grace period: still active, with a billing issue.
    const grace = {
      entitlements: { pro: { expires_date: "2026-10-30T12:00:00Z", grace_period_expires_date: "2026-11-10T12:00:00Z", product_identifier: "notchlift_monthly" } },
      subscriptions: { notchlift_monthly: { billing_issues_detected_at: "2026-10-30T12:00:00Z" } },
    };
    expect(appleSubscriptionState(grace, now)).toMatchObject({ active: true, billingIssue: true });

    expect(appleSubscriptionState({}, now).active).toBe(false);
    expect(appleSubscriptionState(null, now).active).toBe(false);
  });

  it("records real App Store payments only, and spots refunds", () => {
    const purchase = { type: "INITIAL_PURCHASE", environment: "PRODUCTION", store: "APP_STORE", transaction_id: "2000000123", price_in_purchased_currency: 3.99, currency: "GBP", product_id: "notchlift_monthly", purchased_at_ms: now.getTime() };
    expect(applePayment(purchase)).toEqual({ transaction: "2000000123", pence: 399, currency: "gbp", plan: "monthly", paidAt: now.toISOString() });
    expect(applePayment({ ...purchase, type: "RENEWAL" })?.pence).toBe(399);
    expect(applePayment({ ...purchase, environment: "SANDBOX" })).toBeNull();
    expect(applePayment({ ...purchase, type: "CANCELLATION" })).toBeNull();
    expect(applePayment({ ...purchase, currency: null })).toBeNull();

    expect(isAppleRefund({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", transaction_id: "2000000123" })).toBe(true);
    expect(isAppleRefund({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", transaction_id: "2000000123" })).toBe(false);
  });
});
