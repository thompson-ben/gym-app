import { describe, expect, it } from "vitest";
import { heaviestSetPerSession, type HistorySession } from "@/lib/progress";

const session = (id: string, date: string, sets: HistorySession["sets"]): HistorySession => ({
  session_id: id, completed_at: date, template_name: "Chest & back", split_name: "S", split_id: null, sets,
});

describe("heaviestSetPerSession", () => {
  it("reports the heaviest working set per session with its reps, oldest first", () => {
    const points = heaviestSetPerSession(
      [
        session("b", "2026-09-21T17:00:00Z", [
          { set_type: "warmup", weight_kg: 100, reps: 1 }, // warm-ups never count
          { set_type: "working", weight_kg: 72.5, reps: 9 },
          { set_type: "working", weight_kg: 72.5, reps: 6 },
        ]),
        session("a", "2026-09-14T17:00:00Z", [{ set_type: "working", weight_kg: 70, reps: 10 }]),
        session("c", "2026-09-28T17:00:00Z", [{ set_type: "warmup", weight_kg: 40, reps: 10 }]),
      ],
      "weight_reps",
    );
    expect(points.map((p) => [p.sessionId, p.value, p.reps])).toEqual([["a", 70, 10], ["b", 72.5, 9]]);
  });

  it("uses reps for reps-only exercises", () => {
    const [p] = heaviestSetPerSession([session("a", "2026-09-14T17:00:00Z", [{ set_type: "working", weight_kg: null, reps: 15 }, { set_type: "working", weight_kg: null, reps: 12 }])], "bodyweight_reps");
    expect(p.value).toBe(15);
  });
});

describe("chart metrics", () => {
  const w = (weight_kg: number, reps: number) => ({ set_type: "working" as const, weight_kg, reps });
  const history = [
    session("a", "2026-09-17T18:00:00Z", [w(30, 12), w(30, 12), { set_type: "warmup", weight_kg: 60, reps: 3 }]),
    session("b", "2026-09-24T18:00:00Z", [w(40, 8), w(35, 10)]),
  ];

  it("estimates 1RM with Epley and treats a single as its own max", async () => {
    const { estimate1RM } = await import("@/lib/progress");
    expect(estimate1RM(30, 12)).toBeCloseTo(42);
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it("makes different rep ranges comparable, ignoring warm-ups", async () => {
    const { progressSeries } = await import("@/lib/progress");
    expect(progressSeries(history, "weight_reps", "e1rm").map((p) => [p.value, p.detail])).toEqual([
      [42, "30 kg × 12"],
      [50.7, "40 kg × 8"], // 40 × 8 beats 35 × 10 (46.7)
    ]);
    // Weight × reps alone would rank 30 × 12 (360) above 40 × 8 (320); e1RM does not.
    expect(progressSeries(history, "weight_reps", "volume").map((p) => p.value)).toEqual([720, 670]);
    expect(progressSeries(history, "weight_reps", "heaviest").map((p) => p.value)).toEqual([30, 40]);
  });

  it("offers no 1RM estimate for bodyweight movements", async () => {
    const { metricsFor, progressSeries } = await import("@/lib/progress");
    expect(metricsFor("weight_reps").map((m) => m.id)).toEqual(["e1rm", "volume", "heaviest"]);
    expect(metricsFor("added_weight_reps").map((m) => m.id)).toEqual(["heaviest", "reps"]);
    expect(metricsFor("bodyweight_reps").map((m) => m.id)).toEqual(["heaviest", "reps"]);
    const dips = [session("d", "2026-09-24T18:00:00Z", [w(10, 10), w(10, 8)])];
    expect(progressSeries(dips, "added_weight_reps", "reps")[0].value).toBe(18);
    expect(progressSeries(dips, "added_weight_reps", "heaviest")[0].detail).toBe("+10 kg × 10");
  });

  it("reports the best set overall with its real numbers", async () => {
    const { bestSetOverall } = await import("@/lib/progress");
    expect(bestSetOverall(history, "weight_reps")).toMatchObject({ text: "40 kg × 8", e1rm: 50.7, workout: "Chest & back" });
  });
});
