import { describe, expect, it } from "vitest";
import { suggestNextWorkout, type SplitWorkout } from "@/lib/next-workout";

const W: SplitWorkout[] = [
  { id: "ua", name: "Upper A", position: 0, exerciseCount: 4 },
  { id: "la", name: "Lower A", position: 1, exerciseCount: 4 },
  { id: "ub", name: "Upper B", position: 2, exerciseCount: 5 },
  { id: "lb", name: "Lower B", position: 3, exerciseCount: 3 },
];
const s = (templateId: string | null, performedAt: string) => ({ templateId, performedAt });

describe("suggestNextWorkout", () => {
  it("starts at the first workout of a brand-new split", () => {
    expect(suggestNextWorkout({ workouts: W, periodSessions: [], trainedInEarlierPeriod: false })).toMatchObject({ kind: "first", templateId: "ua" });
  });

  it("is neutral when the split was trained in an earlier period but not this one", () => {
    expect(suggestNextWorkout({ workouts: W, periodSessions: [], trainedInEarlierPeriod: true }).kind).toBe("choose");
  });

  it("continues after the most recently performed workout and wraps round", () => {
    const r = suggestNextWorkout({ workouts: W, periodSessions: [s("ua", "2026-09-01"), s("la", "2026-09-02")], trainedInEarlierPeriod: false });
    expect(r).toMatchObject({ kind: "next", templateId: "ub", reason: "Next after Lower A in your split order" });
    expect(suggestNextWorkout({ workouts: W, periodSessions: [s("lb", "2026-09-05")], trainedInEarlierPeriod: false })).toMatchObject({ templateId: "ua" });
  });

  it("follows out-of-order and skipped workouts from the latest one", () => {
    const r = suggestNextWorkout({ workouts: W, periodSessions: [s("ua", "2026-09-01"), s("ub", "2026-09-03")], trainedInEarlierPeriod: false });
    expect(r).toMatchObject({ templateId: "lb" });
  });

  it("orders by when the workout was performed, so a past workout logged later does not jump ahead", () => {
    // Lower B was logged retrospectively for 30 Aug, after Upper A on 1 Sep was logged live.
    const r = suggestNextWorkout({ workouts: W, periodSessions: [s("ua", "2026-09-01T18:00:00Z"), s("lb", "2026-08-30T18:00:00Z")], trainedInEarlierPeriod: false });
    expect(r).toMatchObject({ templateId: "la" });
  });

  it("ignores quick workouts and workouts no longer in the split", () => {
    const r = suggestNextWorkout({ workouts: W, periodSessions: [s("ua", "2026-09-01"), s(null, "2026-09-02"), s("gone", "2026-09-03")], trainedInEarlierPeriod: false });
    expect(r).toMatchObject({ templateId: "la" });
  });

  it("uses the current order after reordering", () => {
    const reordered = W.map((w) => (w.id === "ub" ? { ...w, position: 1 } : w.id === "la" ? { ...w, position: 2 } : w));
    expect(suggestNextWorkout({ workouts: reordered, periodSessions: [s("ua", "2026-09-01")], trainedInEarlierPeriod: false })).toMatchObject({ templateId: "ub" });
  });

  it("passes over workouts without exercises", () => {
    const w = W.map((x) => (x.id === "la" ? { ...x, exerciseCount: 0 } : x));
    expect(suggestNextWorkout({ workouts: w, periodSessions: [s("ua", "2026-09-01")], trainedInEarlierPeriod: false })).toMatchObject({ templateId: "ub" });
    expect(suggestNextWorkout({ workouts: w.map((x) => ({ ...x, exerciseCount: 0 })), periodSessions: [], trainedInEarlierPeriod: false }).kind).toBe("choose");
  });

  it("handles a single-workout split", () => {
    expect(suggestNextWorkout({ workouts: [W[0]], periodSessions: [s("ua", "2026-09-01")], trainedInEarlierPeriod: false })).toMatchObject({ kind: "only", templateId: "ua" });
  });
});
