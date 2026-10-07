import "server-only";
import Stripe from "stripe";

/** Stripe client, or null until STRIPE_SECRET_KEY is set (payments then show as unavailable). */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** Shared with the database (its SHA-256 is in app_settings.billing_secret_hash). */
export function billingSecret(): string | null {
  const s = process.env.BILLING_SECRET;
  return s && s.length >= 32 ? s : null;
}

export const paymentsConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY && billingSecret());
