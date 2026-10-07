import type { Metadata } from "next";
import Link from "next/link";
import { PlanPicker } from "@/components/billing/PlanPicker";
import { ManageBillingButton } from "@/components/billing/ManageBillingButton";
import { IconCheck } from "@/components/icons";
import { buttonClass } from "@/components/styles";
import { PageHeader } from "@/components/ui";
import { MEMBERSHIP_COLUMNS, membershipState, type MembershipRow } from "@/lib/billing/membership";
import { isPlanId } from "@/lib/billing/plans";
import { paymentsConfigured } from "@/lib/billing/server";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a plan" };

const INCLUDED = [
  "Unlimited splits, workouts and history",
  "Targets that tell you when to add weight",
  "Records and progress charts for every lift",
  "Group workouts with friends",
  "Offline logging, kg or lb, export any time",
];

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string; reason?: string }> }) {
  const { plan, reason } = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("memberships").select(MEMBERSHIP_COLUMNS).maybeSingle();
  const state = membershipState(data as MembershipRow);

  if (state.kind === "free" || state.kind === "paid") {
    return (
      <>
        <PageHeader title="Your membership" back={{ href: "/profile", label: "Profile" }} />
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-semibold">{state.kind === "free" ? "You have free access." : "You’re a member. Thank you!"}</p>
          <p className="mt-1 text-sm text-muted">{state.kind === "free" ? "There’s nothing to pay. Enjoy NotchLift." : "Change plan, update your card or cancel from Stripe’s billing page."}</p>
          {state.kind === "paid" ? <div className="mt-4"><ManageBillingButton /></div> : <Link href="/train" className={buttonClass("primary", "md", "mt-4")}>Go to Train</Link>}
        </div>
      </>
    );
  }

  const ended = state.kind !== "trial" || reason === "trial_ended";
  return (
    <>
      <PageHeader
        eyebrow={state.kind === "trial" ? `${state.daysLeft === 1 ? "Last day" : `${state.daysLeft} days left`} of your free trial` : "Membership"}
        title={ended ? "Keep training with NotchLift" : "Choose your plan"}
        back={{ href: "/train", label: "Train" }}
      />
      {ended ? (
        <p className="-mt-2 mb-5 text-muted">Your trial has ended. Everything you’ve logged is safe; choose a plan to keep logging new workouts.</p>
      ) : (
        <p className="-mt-2 mb-5 text-muted">Pick a plan now and keep going without a break when your trial ends.</p>
      )}
      <PlanPicker initial={isPlanId(plan) ? plan : "yearly"} available={paymentsConfigured()} />
      <ul className="mt-8 space-y-2.5">
        {INCLUDED.map((x) => (
          <li key={x} className="flex gap-3">
            <IconCheck size={18} className="mt-0.5 shrink-0 text-accent-text" />
            <span className="text-fg/90">{x}</span>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-4 text-sm text-faint">
        Subscriptions renew automatically until cancelled. Cancel any time from Profile; you keep access until the end of the period you’ve paid for.
        See the <Link href="/terms" className="underline underline-offset-4">terms</Link>.
      </p>
    </>
  );
}
