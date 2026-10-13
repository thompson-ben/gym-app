import { describe, expect, it } from "vitest";
import { sessionsToCsv } from "@/lib/export";
import { formatSet, formatTarget, formatTargetLong, repColumn, repUnit, weightLabel } from "@/lib/format";
import { topOfRangeLastTime, topOfRangeNow } from "@/lib/progression";
import { metricsFor, progressSeries, type HistorySession } from "@/lib/progress";
import { compareWithPrevious, recordsFor } from "@/lib/records";
import { validateCompletion } from "@/lib/session/doc";
import { isAddedWeight, isTimed, isUnloaded, type PreviousSet, type SessionExercise } from "@/lib/types";

const w = (reps: number, weight: number | null = null): PreviousSet => ({ set_type: "working", weight_kg: weight, reps });

describe("timed exercises: seconds in the reps fields", () => {
  it("classifies the modes", () => {
    expect([isTimed("duration"), isTimed("added_weight_duration"), isTimed("bodyweight_reps")]).toEqual([true, true, false]);
    expect([isUnloaded("duration"), isUnloaded("added_weight_duration")]).toEqual([true, false]);
    expect(isAddedWeight("added_weight_duration")).toBe(true);
  });

  it("formats holds in seconds", () => {
    expect(formatSet("duration", null, 15)).toBe("15 s");
    expect(formatSet("added_weight_duration", 0, 30)).toBe("BW × 30 s");
    expect(formatSet("added_weight_duration", 10, 30)).toBe("+10 × 30 s");
    expect(formatSet("bodyweight_reps", null, 12)).toBe("12 reps");
    expect(formatTarget(3, 10, 15, "duration")).toBe("3 × 10–15 s");
    expect(formatTarget(null, 60, 60, "duration")).toBe("60 s");
    expect(formatTarget(3, 8, 12)).toBe("3 × 8–12");
    expect(formatTargetLong(3, 10, 15, "duration")).toBe("3 working sets · 10–15 s");
    expect([repUnit("duration"), repColumn("duration"), repColumn("weight_reps")]).toEqual(["s", "Secs", "Reps"]);
    expect(weightLabel("added_weight_duration", "kg")).toBe("+kg");
  });

  it("confirms a hold with seconds and no weight, or bodyweight for loaded holds", () => {
    const ex = (mode: SessionExercise["tracking_mode"]) => ({ tracking_mode: mode }) as SessionExercise;
    const set = (reps: number | null, weight: number | null = null) => ({ id: "s", position: 0, set_type: "working" as const, weight_kg: weight, reps, completed_at: null });
    expect(validateCompletion(ex("duration"), set(15, 20))).toEqual({ weight: null });
    expect(validateCompletion(ex("added_weight_duration"), set(30))).toEqual({ weight: 0 });
    expect(validateCompletion(ex("duration"), set(null))).toEqual({ error: "reps_required" });
  });

  it("announces the longest hold and compares total time", () => {
    const cur = { sessionId: "b", performedAt: "2026-10-02", sets: [w(18), w(15)] };
    const hist = [{ sessionId: "a", performedAt: "2026-10-01", sets: [w(15), w(12)] }, cur];
    expect(recordsFor("duration", cur, hist)).toEqual([{ kind: "most_reps", label: "Longest hold", detail: "18 s (previous best 15 s)" }]);
    expect(compareWithPrevious("duration", cur.sets, hist[0].sets)).toBe("6 s longer in total");
    expect(compareWithPrevious("added_weight_duration", [w(30, 10)], [w(40, 10)])).toBe("10 s shorter in total at +10 kg");

    const loaded = { sessionId: "b", performedAt: "2026-10-02", sets: [w(45, 10)] };
    const before = { sessionId: "a", performedAt: "2026-10-01", sets: [w(40, 10)] };
    expect(recordsFor("added_weight_duration", loaded, [before, loaded])).toEqual([
      { kind: "reps_at_load", label: "Longest hold at +10 kg", detail: "45 s (previous best 40 s)" },
    ]);
  });

  it("charts longest hold and total time", () => {
    expect(metricsFor("duration").map((m) => [m.label, m.unit])).toEqual([["Longest hold", "s"], ["Total time", "s"]]);
    expect(metricsFor("added_weight_duration").map((m) => m.label)).toEqual(["Heaviest", "Total time"]);
    const history: HistorySession[] = [
      { session_id: "a", completed_at: "2026-10-01", template_name: "Skill", split_name: null, split_id: null, sets: [w(12), w(15)] },
    ];
    expect(progressSeries(history, "duration", "heaviest")[0]).toMatchObject({ value: 15, detail: "15 s" });
    expect(progressSeries(history, "duration", "reps")[0]).toMatchObject({ value: 27 });
  });

  it("nudges at the top of a time range, as for loaded lifts", () => {
    const plan = { targetSets: 2, repMin: 10, repMax: 15 };
    expect(topOfRangeLastTime("duration", plan, [w(15), w(16)])).toBe(15);
    expect(topOfRangeLastTime("duration", plan, [w(15), w(12)])).toBeNull();
    const done = [w(15), w(15)].map((s) => ({ ...s, completed_at: "x" }));
    expect(topOfRangeNow("duration", plan, done)).toBe(true);
  });

  it("exports seconds in their own column", () => {
    const csv = sessionsToCsv(
      [{
        id: "s1", performed_at: "2026-10-05T08:00:00Z", workout: "Skill", split: null, backdated: false, notes: null,
        exercises: [{ exercise_id: "e", name: "Front Lever", tracking_mode: "duration", position: 0, skipped: false, notes: null,
          sets: [{ position: 0, set_type: "working", weight_kg: null, reps: 15, completed_at: "x" }] }],
      }],
      "Europe/London",
    );
    expect(csv.trim().split("\r\n")[1]).toBe("2026-10-05,09:00,Skill,,Front Lever,1,working,,,,no,s1,15");
  });
});

describe("hold timer", () => {
  it("counts in, then counts whole seconds held from timestamps", async () => {
    const { startHold, holdPhase, heldSeconds } = await import("@/lib/hold-timer");
    const t = startHold(1_000_000);
    expect(holdPhase(t, 1_000_000)).toEqual({ phase: "count_in", secondsLeft: 3 });
    expect(holdPhase(t, 1_002_100)).toEqual({ phase: "count_in", secondsLeft: 1 });
    expect(holdPhase(t, 1_003_000)).toEqual({ phase: "holding", seconds: 0 });
    expect(heldSeconds(t, 1_018_900)).toBe(15);
    expect(heldSeconds(t, 1_001_000)).toBe(0);
  });

  it("accepts seconds up to an hour, reps up to 1000", async () => {
    const { parseReps, MAX_SECONDS } = await import("@/lib/validation");
    expect(parseReps("1500")).toBeNaN();
    expect(parseReps("1500", MAX_SECONDS)).toBe(1500);
    expect(parseReps("3601", MAX_SECONDS)).toBeNaN();
  });
});
