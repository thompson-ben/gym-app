import "server-only";
import { appleSubscriptionState, type RevenueCatSubscriber } from "./apple";
import { billingSecret } from "./server";
import { supabaseAnon } from "../supabase/anon";

/** RevenueCat's secret API key (v1, "sk_…"), for reading subscribers server-side. */
const secretKey = () => process.env.REVENUECAT_SECRET_KEY || null;

export const appStoreConfigured = () => Boolean(secretKey() && billingSecret());

/**
 * Reads the subscriber from RevenueCat and applies it to the membership. RevenueCat is the
 * source of truth, so this is safe to run any number of times, in any order.
 */
export async function syncAppleSubscription(userId: string): Promise<"paid" | "lapsed" | "unchanged" | "error"> {
  const key = secretKey();
  const secret = billingSecret();
  if (!key || !secret) return "error";
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return "error";
  const { subscriber } = (await res.json()) as { subscriber?: RevenueCatSubscriber };
  const s = appleSubscriptionState(subscriber);
  const { data, error } = await supabaseAnon().rpc("apple_apply_subscription", {
    p_secret: secret,
    p_user: userId,
    p_active: s.active,
    p_plan: s.plan,
    p_expires_at: s.expiresAt,
    p_will_renew: s.willRenew,
    p_billing_issue: s.billingIssue,
  });
  // A deleted account: nothing to update, and nothing to retry.
  if (error?.code === "P0002") return "unchanged";
  if (error) return "error";
  return data as "paid" | "lapsed" | "unchanged";
}
