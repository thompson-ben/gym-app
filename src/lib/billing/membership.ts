/** What a membership row means for the person (pure; unit-tested). */
export type MembershipRow = {
  status: "founder" | "trial" | "paid" | "lapsed";
  trial_ends_at: string | null;
  plan?: "monthly" | "yearly" | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  billing_issue?: boolean | null;
  stripe_customer_id?: string | null;
  /** Migration 15: free for good (given free access). Founders without it are early access. */
  free_access?: boolean | null;
} | null;

export type MembershipState =
  | { kind: "free"; early?: boolean }
  | { kind: "trial"; daysLeft: number; endsAt: string }
  | { kind: "trial_ended"; endedAt: string | null }
  | { kind: "paid"; plan: "monthly" | "yearly" | null; renewsAt: string | null; canceling: boolean; billingIssue: boolean }
  | { kind: "lapsed" };

const DAY = 86_400_000;

export function membershipState(m: MembershipRow, now: Date = new Date()): MembershipState {
  // No row (before memberships existed) is treated like a founder: never locked out.
  if (!m) return { kind: "free" };
  if (m.status === "founder") return m.free_access === false ? { kind: "free", early: true } : { kind: "free" };
  if (m.status === "paid") {
    return { kind: "paid", plan: m.plan ?? null, renewsAt: m.current_period_end ?? null, canceling: Boolean(m.cancel_at_period_end), billingIssue: Boolean(m.billing_issue) };
  }
  if (m.status === "trial") {
    if (!m.trial_ends_at) return { kind: "free" };
    const left = new Date(m.trial_ends_at).getTime() - now.getTime();
    // "Ends today" counts as 1 day left, until the moment it ends.
    return left > 0 ? { kind: "trial", daysLeft: Math.max(1, Math.ceil(left / DAY)), endsAt: m.trial_ends_at } : { kind: "trial_ended", endedAt: m.trial_ends_at };
  }
  return { kind: "lapsed" };
}

export const canStartWorkouts = (s: MembershipState) => s.kind === "free" || s.kind === "trial" || s.kind === "paid";

export const MEMBERSHIP_COLUMNS = "status, trial_ends_at, plan, current_period_end, cancel_at_period_end, billing_issue, stripe_customer_id, free_access";
