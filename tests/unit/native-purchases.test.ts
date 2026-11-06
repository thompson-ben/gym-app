import { describe, expect, it, vi } from "vitest";

// Like a real Capacitor plugin: every property name is a native method, including "then".
// Returning such an object from an async function hangs, which is what broke the plan list.
const calls: string[] = [];
vi.mock("@revenuecat/purchases-capacitor", () => {
  const methods: Record<string, (...a: unknown[]) => Promise<unknown>> = {
    isConfigured: async () => ({ isConfigured: false }),
    configure: async () => undefined,
    getProducts: async () => ({ products: [{ identifier: "notchlift_yearly", priceString: "£29.99", title: "Setmodo Pro Yearly" }, { identifier: "notchlift_monthly", priceString: "£3.99", title: "Setmodo Pro Monthly" }] }),
  };
  const Purchases = new Proxy({}, {
    get: (_t, prop: string) => (...args: unknown[]) => {
      calls.push(prop);
      return methods[prop] ? methods[prop](...args) : new Promise(() => undefined); // never answers
    },
  });
  return { Purchases };
});

describe("App Store plans in the iOS app", () => {
  it("loads both plans without awaiting the plugin itself", async () => {
    vi.stubEnv("NEXT_PUBLIC_REVENUECAT_IOS_KEY", "appl_test");
    const { appStorePlans } = await import("@/lib/native-purchases");
    const plans = await Promise.race([
      appStorePlans("user-1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("hung")), 500)),
    ]);
    expect(plans).toEqual([
      { plan: "monthly", price: "£3.99", title: "Setmodo Pro Monthly" },
      { plan: "yearly", price: "£29.99", title: "Setmodo Pro Yearly" },
    ]);
    expect(calls).not.toContain("then");
  });
});
