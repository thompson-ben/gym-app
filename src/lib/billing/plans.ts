/** Paid plans. Prices are created in Stripe with these lookup keys and must match. */
export type PlanId = "monthly" | "yearly";

export const PLANS: Record<PlanId, { lookupKey: string; pence: number; price: string; per: string; label: string }> = {
  monthly: { lookupKey: "notchlift_monthly", pence: 399, price: "£3.99", per: "month", label: "Monthly" },
  yearly: { lookupKey: "notchlift_yearly", pence: 3000, price: "£30", per: "year", label: "Yearly" },
};

export const isPlanId = (v: unknown): v is PlanId => v === "monthly" || v === "yearly";

/** "£2.50" a month on the yearly plan. */
export const YEARLY_PER_MONTH = `£${(PLANS.yearly.pence / 12 / 100).toFixed(2)}`;
/** Whole-percent saving of yearly over twelve monthly payments (37). */
export const YEARLY_SAVING_PCT = Math.floor((1 - PLANS.yearly.pence / (PLANS.monthly.pence * 12)) * 100);
