"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlanId } from "@/lib/billing/plans";
import { appStorePlans, appStorePurchasesAvailable, buyAppStorePlan, restoreAppStorePurchases, type AppStorePlan } from "@/lib/native-purchases";
import { IconCheck } from "../icons";
import { Button, ErrorNote, Spinner, cx } from "../ui";

/** Apple's standard licence, which applies when an app doesn't have its own (App Store Connect → EULA). */
const APPLE_EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

/**
 * The plan picker inside the iOS app: the App Store's own products and local prices, bought
 * with Apple. Shows what Apple requires on a subscription screen (length, price, renewal,
 * restore, terms and privacy).
 */
export function AppStorePlanPicker({ userId, initial = "yearly" }: { userId: string; initial?: PlanId }) {
  const router = useRouter();
  // No App Store key configured: nothing to load.
  const [plans, setPlans] = useState<AppStorePlan[] | null>(() => (appStorePurchasesAvailable() ? null : []));
  const [plan, setPlan] = useState<PlanId>(initial);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!appStorePurchasesAvailable()) return;
    appStorePlans(userId).then(setPlans, () => setPlans([]));
  }, [userId]);

  async function buy() {
    setBusy("buy");
    setError(null);
    setNotice(null);
    const result = await buyAppStorePlan(userId, plan).catch(() => ({ ok: false as const, reason: "failed" as const }));
    setBusy(null);
    if (result.ok) return router.push("/upgrade/success?session_id=app-store");
    if (result.reason === "pending") return setNotice("Your purchase is waiting for approval. Your membership starts as soon as Apple confirms it.");
    if (result.reason === "failed") setError("The purchase didn’t go through. You haven’t been charged; please try again.");
  }

  async function restore() {
    setBusy("restore");
    setError(null);
    setNotice(null);
    const ok = await restoreAppStorePurchases(userId).catch(() => false);
    setBusy(null);
    if (!ok) return setError("Couldn’t restore purchases just now. Please try again.");
    setNotice("Purchases restored. If you had a subscription, it’s active again.");
    router.refresh();
  }

  if (plans === null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (!plans.length) {
    return <p className="rounded-3xl border border-line bg-surface p-5 text-muted">Plans aren’t available from the App Store right now. Please try again later.</p>;
  }

  const order: PlanId[] = ["yearly", "monthly"];
  const shown = order.flatMap((id) => plans.filter((p) => p.plan === id));
  return (
    <div>
      <div role="radiogroup" aria-label="Plan" className="space-y-3">
        {shown.map((o) => (
          <button
            key={o.plan}
            type="button"
            role="radio"
            aria-checked={plan === o.plan}
            onClick={() => setPlan(o.plan)}
            className={cx(
              "flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition",
              plan === o.plan ? "border-accent-text bg-accent-soft" : "border-line bg-surface",
            )}
          >
            <span aria-hidden="true" className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", plan === o.plan ? "border-accent-text bg-accent-text text-bg" : "border-line")}>
              {plan === o.plan ? <IconCheck size={14} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{o.plan === "yearly" ? "Yearly" : "Monthly"}</span>
              <span className="mt-0.5 block text-sm text-muted">{o.plan === "yearly" ? "Billed once a year" : "Billed monthly. Cancel any time."}</span>
            </span>
            <span className="shrink-0 text-right font-semibold tabular">
              {o.price} / {o.plan === "yearly" ? "year" : "month"}
            </span>
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {notice ? <p role="status" className="mt-3 text-sm text-muted">{notice}</p> : null}
      <Button variant="primary" size="lg" className="mt-5 w-full" busy={busy === "buy"} disabled={busy !== null} onClick={buy}>
        Subscribe
      </Button>
      <Button variant="quiet" size="md" className="mt-2 w-full" busy={busy === "restore"} disabled={busy !== null} onClick={restore}>
        Restore purchases
      </Button>
      <p className="mt-4 text-center text-xs leading-relaxed text-faint">
        Payment is charged to your Apple Account when you confirm. The subscription renews automatically at the same price unless you cancel at least 24 hours
        before the end of the period. Manage or cancel any time in your App Store account settings.{" "}
        <a href={APPLE_EULA} target="_blank" rel="noopener" className="underline underline-offset-2">Terms of Use</a> ·{" "}
        <Link href="/terms" className="underline underline-offset-2">Terms</Link> ·{" "}
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
      </p>
    </div>
  );
}
