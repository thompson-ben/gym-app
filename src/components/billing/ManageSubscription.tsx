"use client";

import { buttonClass, type ButtonSize, type ButtonVariant } from "../styles";
import { ManageBillingButton } from "./ManageBillingButton";

/** Apple's page for the subscriptions on the person's Apple Account (opens the App Store on iPhone). */
export const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/**
 * Where a member changes or cancels their subscription: with Apple if they paid in the iOS app,
 * Stripe's page if they paid on the website. Inside the app, a website subscription is only
 * described: the App Store doesn't allow links out to other ways of paying.
 */
export function ManageSubscription({
  source,
  native,
  label = "Manage subscription",
  variant = "secondary",
  size = "md",
}: {
  source: "stripe" | "apple" | null | undefined;
  /** Running in the iOS app (from the request's user agent, so server and browser agree). */
  native: boolean;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  if (source === "apple") {
    return (
      <>
        <a href={APPLE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener" className={buttonClass(variant, size)}>{label}</a>
        <p className="mt-2 text-sm text-faint">Your subscription is with Apple, so it’s managed in your App Store account.</p>
      </>
    );
  }
  if (native) {
    return <p className="text-sm text-muted">You subscribed on notchlift.com, so your subscription is managed there.</p>;
  }
  return <ManageBillingButton label={label} variant={variant} size={size} />;
}
