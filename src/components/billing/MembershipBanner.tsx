import Link from "next/link";
import type { MembershipState } from "@/lib/billing/membership";
import { YEARLY_PER_MONTH } from "@/lib/billing/plans";
import { REFERRAL_DAYS } from "@/lib/referral";
import { buttonClass, cx } from "../styles";
import { ManageSubscription } from "./ManageSubscription";

/** Train screen: trial countdown (with the invite offer), trial ended, or a failed payment. Nothing otherwise. */
export function MembershipBanner({
  state,
  invite = false,
  source = null,
  native = false,
}: {
  state: MembershipState;
  invite?: boolean;
  /** Who takes the payments (migration 37): a failed Apple payment is fixed in the App Store. */
  source?: "stripe" | "apple" | null;
  /** In the iOS app, prices come from the App Store, so none are quoted here. */
  native?: boolean;
}) {
  if (state.kind === "trial") {
    const urgent = state.daysLeft <= 3;
    return (
      <>
        <Link
          href="/upgrade"
          className={cx(
            "mt-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm",
            urgent ? "border border-accent-text/50 bg-accent-soft" : "bg-surface-2",
          )}
        >
          <span>
            <span className="font-semibold">{state.daysLeft === 1 ? "Last day" : `${state.daysLeft} days left`}</span>
            <span className="text-muted"> of your free trial{urgent && !native ? ` · keep training from ${YEARLY_PER_MONTH}/month` : ""}</span>
          </span>
          <span className="shrink-0 font-medium text-accent-text">See plans</span>
        </Link>
        {invite ? (
          <Link href="/profile#invite" className="mt-1.5 block px-1 text-sm text-muted">
            Invite a training partner and get <span className="font-medium text-accent-text">{REFERRAL_DAYS} more days free</span>
          </Link>
        ) : null}
      </>
    );
  }
  if (state.kind === "trial_ended" || state.kind === "lapsed") {
    return (
      <section aria-labelledby="membership-ended" className="mt-2 rounded-3xl border border-accent-text/40 bg-accent-soft p-5">
        <h2 id="membership-ended" className="text-lg font-semibold">{state.kind === "trial_ended" ? "Your free trial has ended" : "Your membership has ended"}</h2>
        <p className="mt-1 text-sm text-muted">
          Your workouts, history and progress are all still here, and you can export them any time. Choose a plan to keep logging new workouts.
        </p>
        <Link href="/upgrade" className={buttonClass("primary", "lg", "mt-4 w-full")}>Choose a plan</Link>
      </section>
    );
  }
  if (state.kind === "paid" && state.billingIssue) {
    return (
      <section className="mt-2 rounded-2xl border border-warn/40 px-4 py-3 text-sm">
        <p>
          <span className="font-semibold">Your last payment didn’t go through.</span>{" "}
          <span className="text-muted">{source === "apple" ? "Update your payment method with Apple to keep your membership." : "Update your card to keep your membership."}</span>
        </p>
        <div className="mt-2"><ManageSubscription source={source} native={native} label={source === "apple" ? "Update payment" : "Update card"} size="sm" /></div>
      </section>
    );
  }
  return null;
}
