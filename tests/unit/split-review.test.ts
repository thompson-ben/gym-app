import { describe, expect, it } from "vitest";
import { inPeriod, repeatedExercises, weekStart, weeklyWorkingSets, workoutBreakdown, type ReviewSession } from "@/lib/split-review";
import { meaningfulDurationMinutes } from "@/lib/format";

const w = (weight_kg: number, reps: number) => ({ set_type: "working" as const, weight_kg, reps });
const sess = (id: string, performedAt: string, workoutName: string, sets: ReturnType<typeof w>[], extra: Partial<ReviewSession> = {}): ReviewSession => ({
  id, performedAt, workoutName,
  exercises: [{ exerciseId: "bench", name: "Bench", mode: "weight_reps", skipped: false, sets: [{ set_type: "warmup", weight_kg: 20, reps: 10 }, ...sets] }],
  ...extra,
});

describe("split review", () => {
  it("assigns sessions by performed date to half-open periods", () => {
    expect(inPeriod("2026-09-10T10:00:00Z", "2026-09-01T00:00:00Z", "2026-09-10T10:00:00Z")).toBe(false);
    expect(inPeriod("2026-09-10T10:00:00Z", "2026-09-10T10:00:00Z", null)).toBe(true);
  });

  it("buckets weeks Monday to Sunday in the viewer's time zone", () => {
    expect(weekStart("2026-09-27T23:30:00Z", "Europe/London")).toBe("2026-09-28"); // Mon 28 Sep, 00:30 BST
    expect(weekStart("2026-09-27T23:30:00Z", "UTC")).toBe("2026-09-21");
  });

  it("counts working sets per week, including empty weeks, never warm-ups", () => {
    const weeks = weeklyWorkingSets(
      [sess("a", "2026-09-01T18:00:00Z", "Upper A", [w(30, 10), w(30, 9)]), sess("b", "2026-09-16T18:00:00Z", "Lower A", [w(30, 10)])],
      "UTC", "2026-09-01T00:00:00Z", "2026-09-17T00:00:00Z",
    );
    expect(weeks).toEqual([
      { week: "2026-08-31", sets: 2, sessions: 1 },
      { week: "2026-09-07", sets: 0, sessions: 0 },
      { week: "2026-09-14", sets: 1, sessions: 1 },
    ]);
  });

  it("breaks sessions down by workout name as logged", () => {
    expect(workoutBreakdown([sess("a", "1", "Upper A", []), sess("b", "2", "Upper A", []), sess("c", "3", "Lower A", [])])).toEqual([
      { name: "Upper A", count: 2 },
      { name: "Lower A", count: 1 },
    ]);
  });

  it("compares first and latest best sets of repeated exercises, with eligible estimates only", () => {
    const [c] = repeatedExercises([sess("b", "2026-09-08", "Upper A", [w(32.5, 8)]), sess("a", "2026-09-01", "Upper A", [w(30, 10)])]);
    expect(c).toMatchObject({ sessions: 2, first: { set: { weight_kg: 30, reps: 10 } }, latest: { set: { weight_kg: 32.5, reps: 8 } }, e1rm: { first: 40, latest: 41.2 } });
    const [hi] = repeatedExercises([sess("a", "1", "A", [w(20, 20)]), sess("b", "2", "A", [w(20, 22)])]);
    expect(hi.e1rm).toBeNull();
    expect(repeatedExercises([sess("a", "1", "A", [w(20, 20)])])).toEqual([]);
  });

  it("shows duration only for live workouts of plausible length", () => {
    expect(meaningfulDurationMinutes("2026-09-01T17:00:00Z", "2026-09-01T18:05:00Z", false)).toBe(65);
    expect(meaningfulDurationMinutes("2026-09-01T17:00:00Z", "2026-09-01T18:05:00Z", true)).toBeNull();
    expect(meaningfulDurationMinutes("2026-09-01T17:00:00Z", "2026-09-03T18:05:00Z", false)).toBeNull();
  });
});
