/**
 * App Store subscriptions in the iOS app, through RevenueCat's plugin. RevenueCat is set up
 * with the NotchLift user ID, so purchases follow the account (not the device), and after a
 * purchase or restore the server re-reads RevenueCat (/api/billing/apple-sync).
 *
 * NEXT_PUBLIC_REVENUECAT_IOS_KEY is RevenueCat's public Apple key ("appl_…"); it's safe in
 * the page.
 */

import { APPLE_PRODUCTS } from "./billing/apple";
import type { PlanId } from "./billing/plans";

const API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;

export const appStorePurchasesAvailable = () => Boolean(API_KEY);

let configuredFor: string | null = null;

async function purchases(userId: string) {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  if (!API_KEY) throw new Error("not_configured");
  if (configuredFor !== userId) {
    const { isConfigured } = await Purchases.isConfigured();
    if (isConfigured) await Purchases.logIn({ appUserID: userId });
    else await Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    configuredFor = userId;
  }
  return Purchases;
}

export type AppStorePlan = { plan: PlanId; price: string; title: string };

/** The two plans as the App Store sells them, with prices in the person's own currency. */
export async function appStorePlans(userId: string): Promise<AppStorePlan[]> {
  const p = await purchases(userId);
  const { products } = await p.getProducts({ productIdentifiers: Object.values(APPLE_PRODUCTS) });
  return (Object.keys(APPLE_PRODUCTS) as PlanId[]).flatMap((plan) => {
    const product = products.find((x) => x.identifier === APPLE_PRODUCTS[plan]);
    return product ? [{ plan, price: product.priceString, title: product.title }] : [];
  });
}

async function syncMembership(): Promise<boolean> {
  const res = await fetch("/api/billing/apple-sync", { method: "POST" });
  return res.ok;
}

export type PurchaseResult = { ok: true } | { ok: false; reason: "cancelled" | "failed" | "pending" };

export async function buyAppStorePlan(userId: string, plan: PlanId): Promise<PurchaseResult> {
  const p = await purchases(userId);
  try {
    const { products } = await p.getProducts({ productIdentifiers: [APPLE_PRODUCTS[plan]] });
    const product = products[0];
    if (!product) return { ok: false, reason: "failed" };
    await p.purchaseStoreProduct({ product });
  } catch (error) {
    const e = error as { userCancelled?: boolean | null; code?: string | number };
    if (e?.userCancelled) return { ok: false, reason: "cancelled" };
    // Ask to Buy, or a payment still being confirmed: Apple finishes it later.
    if (String(e?.code) === "20" || String(e?.code) === "PAYMENT_PENDING_ERROR") return { ok: false, reason: "pending" };
    return { ok: false, reason: "failed" };
  }
  return (await syncMembership()) ? { ok: true } : { ok: false, reason: "failed" };
}

/** Apple requires a way to restore purchases (a new phone, or reinstalling the app). */
export async function restoreAppStorePurchases(userId: string): Promise<boolean> {
  const p = await purchases(userId);
  await p.restorePurchases();
  return syncMembership();
}
