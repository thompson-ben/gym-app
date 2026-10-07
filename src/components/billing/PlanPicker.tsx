"use client";

import { useState } from "react";
import { PLANS, YEARLY_PER_MONTH, YEARLY_SAVING_PCT, type PlanId } from "@/lib/billing/plans";
import { IconCheck } from "../icons";
import { Button, ErrorNote, cx } from "../ui";

/** Monthly or yearly (yearly first and pre-selected), then Stripe Checkout. */
export function PlanPicker({ initial = "yearly", available }: { initial?: PlanId; available: boolean }) {
  const [plan, setPlan] = useState<PlanId>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (json.url) return window.location.assign(json.url);
    setBusy(false);
    setError(json.error ?? "Couldn’t start checkout. Please try again.");
  }

  const options: { id: PlanId; title: string; price: string; detail: string; badge?: string }[] = [
    { id: "yearly", title: "Yearly", price: `${PLANS.yearly.price} / year`, detail: `Just ${YEARLY_PER_MONTH} a month, billed once a year`, badge: `Save ${YEARLY_SAVING_PCT}%` },
    { id: "monthly", title: "Monthly", price: `${PLANS.monthly.price} / month`, detail: "Billed monthly. Cancel any time." },
  ];

  return (
    <div>
      <div role="radiogroup" aria-label="Plan" className="space-y-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={plan === o.id}
            onClick={() => setPlan(o.id)}
            className={cx(
              "flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition",
              plan === o.id ? "border-accent-text bg-accent-soft" : "border-line bg-surface hover:bg-surface-2/60",
            )}
          >
            <span aria-hidden="true" className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", plan === o.id ? "border-accent-text bg-accent-text text-bg" : "border-line")}>
              {plan === o.id ? <IconCheck size={14} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-semibold">{o.title}</span>
                {o.badge ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">{o.badge}</span> : null}
              </span>
              <span className="mt-0.5 block text-sm text-muted">{o.detail}</span>
            </span>
            <span className="shrink-0 text-right font-semibold tabular">{o.price}</span>
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Button variant="primary" size="lg" className="mt-5 w-full" busy={busy} disabled={!available} onClick={checkout}>
        Continue to secure payment
      </Button>
      <p className="mt-3 text-center text-sm text-faint">
        {available ? "Payments by Stripe. Apple Pay and Google Pay accepted. Cancel any time from Profile." : "Payments aren’t switched on yet. Check back soon."}
      </p>
    </div>
  );
}
