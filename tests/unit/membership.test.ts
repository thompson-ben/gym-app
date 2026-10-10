import { describe, expect, it } from "vitest";
import { PLANS, YEARLY_PER_MONTH, YEARLY_SAVING_PCT } from "@/lib/billing/plans";
import { canStartWorkouts, membershipState } from "@/lib/billing/membership";

const now = new Date("2026-10-07T12:00:00Z");
const trial = (endsAt: string) => membershipState({ status: "trial", trial_ends_at: endsAt }, now);

describe("membership state", () => {
  it("counts trial days left, rounding up, and ends exactly at the end time", () => {
    expect(trial("2026-10-21T12:00:00Z")).toEqual({ kind: "trial", daysLeft: 14, endsAt: "2026-10-21T12:00:00Z" });
    expect(trial("2026-10-09T11:00:00Z")).toMatchObject({ kind: "trial", daysLeft: 2 });
    expect(trial("2026-10-07T12:30:00Z")).toMatchObject({ kind: "trial", daysLeft: 1 });
    expect(trial("2026-10-07T11:59:59Z")).toEqual({ kind: "trial_ended", endedAt: "2026-10-07T11:59:59Z" });
  });

  it("founders and missing rows are free; lapsed and ended trials cannot start workouts", () => {
    expect(membershipState({ status: "founder", trial_ends_at: null }, now)).toEqual({ kind: "free" });
    expect(membershipState(null, now)).toEqual({ kind: "free" });
    expect(membershipState({ status: "founder", trial_ends_at: null, free_access: false }, now)).toEqual({ kind: "free", early: true });
    expect(membershipState({ status: "founder", trial_ends_at: null, free_access: true }, now)).toEqual({ kind: "free" });
    expect(canStartWorkouts(membershipState({ status: "lapsed", trial_ends_at: null }, now))).toBe(false);
    expect(canStartWorkouts(trial("2026-10-01T00:00:00Z"))).toBe(false);
    expect(canStartWorkouts(trial("2026-10-10T00:00:00Z"))).toBe(true);
    expect(membershipState({ status: "paid", trial_ends_at: null, plan: "yearly", cancel_at_period_end: true, current_period_end: "2027-10-07T00:00:00Z" }, now)).toEqual({
      kind: "paid",
      plan: "yearly",
      renewsAt: "2027-10-07T00:00:00Z",
      canceling: true,
      billingIssue: false,
    });
  });

  it("prices: £3.99 a month or £30 a year (£2.50 a month, 37% less)", () => {
    expect(PLANS.monthly.pence).toBe(399);
    expect(PLANS.yearly.pence).toBe(3000);
    expect(YEARLY_PER_MONTH).toBe("£2.50");
    expect(YEARLY_SAVING_PCT).toBe(37);
  });
});
