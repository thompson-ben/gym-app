import { describe, expect, it } from "vitest";
import { formatSet } from "@/lib/format";
import { computeTarget, formatTargetSets, targetMet } from "@/lib/progression";
import { progressSeries } from "@/lib/progress";
import { compareWithPrevious, recordsFor } from "@/lib/records";
import { formatWeight, formatWeightValue, fromUnit, parseIncrement, toUnit } from "@/lib/units";
import { parseWeight } from "@/lib/validation";

describe("weight units", () => {
  it("round-trips any pound value typed to 0.01 lb through 4-decimal kg storage", () => {
    for (let cents = 0; cents <= 100_000; cents += 7) {
      const lb = cents / 100;
      expect(formatWeightValue(fromUnit(lb, "lb"), "lb")).toBe(String(lb));
    }
    expect(fromUnit(135, "lb")).toBe(61.235);
    expect(formatWeight(61.235, "lb")).toBe("135 lb");
    expect(formatWeight(72.5, "kg")).toBe("72.5 kg");
  });

  it("keeps kg exact", () => {
    expect(fromUnit(72.5, "kg")).toBe(72.5);
    expect(toUnit(72.5, "kg")).toBe(72.5);
  });

  it("validates input against the unit's maximum", () => {
    expect(parseWeight("2200", "lb")).toBe(2200);
    expect(parseWeight("2200", "kg")).toBeNaN();
    expect(parseWeight("135,5", "lb")).toBe(135.5);
  });

  it("formats sets, targets, records and charts in the chosen unit", () => {
    const kg = fromUnit(135, "lb");
    expect(formatSet("weight_reps", kg, 8, "lb")).toBe("135 × 8");
    expect(formatSet("added_weight_reps", fromUnit(25, "lb"), 10, "lb")).toBe("+25 × 10");
    expect(formatTargetSets({ weightKg: fromUnit(140, "lb"), reps: [8, 8] }, "lb")).toBe("140 lb × 8");
    const w = (lb: number, reps: number) => ({ set_type: "working" as const, weight_kg: fromUnit(lb, "lb"), reps });
    expect(compareWithPrevious("weight_reps", [w(135, 10)], [w(135, 8)], "lb")).toBe("2 more reps at 135 lb");
    expect(recordsFor("weight_reps", { sessionId: "b", performedAt: "2", sets: [w(145, 5)] }, [{ sessionId: "a", performedAt: "1", sets: [w(135, 5)] }], "lb")[0].detail).toBe(
      "145 lb (previous 135 lb)",
    );
    const [p] = progressSeries([{ session_id: "a", completed_at: "1", template_name: "A", split_name: null, split_id: null, sets: [w(135, 5)] }], "weight_reps", "heaviest", "lb");
    expect(p).toMatchObject({ value: 135, detail: "135 lb × 5" });
  });
});

describe("parseIncrement", () => {
  it("accepts increments in the user's unit and returns kg", () => {
    expect(parseIncrement("2,5", "kg")).toEqual({ kg: 2.5 });
    expect(parseIncrement("5", "lb")).toEqual({ kg: 2.268 });
    expect(parseIncrement("110", "lb")).toEqual({ kg: 49.8952 });
    expect(parseIncrement("", "lb")).toEqual({ kg: null });
  });
  it("rejects out-of-range values with a message in the unit", () => {
    expect(parseIncrement("0.1", "kg")).toEqual({ error: "Choose a weight increment between 0.25 and 50 kg." });
    expect(parseIncrement("120", "lb")).toEqual({ error: "Choose a weight increment between 0.5 and 110 lb." });
  });
  it("shows a stored increment back exactly as typed", () => {
    const r = parseIncrement("5", "lb");
    expect("kg" in r && formatWeightValue(r.kg, "lb")).toBe("5");
  });
});

describe("targets in pounds", () => {
  it("adds a pound increment without drifting off whole pounds", () => {
    const sets = [1, 2, 3].map(() => ({ set_type: "working" as const, weight_kg: fromUnit(100, "lb"), reps: 12 }));
    const inc = parseIncrement("5", "lb");
    const r = computeTarget({
      mode: "weight_reps",
      settings: { enabled: true, incrementKg: "kg" in inc ? inc.kg : null },
      prescription: { targetSets: 3, repMin: 8, repMax: 12 },
      entryId: "e",
      candidates: [{ sessionId: "s", templateExerciseId: "e", completedAt: "2026-10-01", workoutName: "Push", prescription: { targetSets: 3, repMin: 8, repMax: 12 }, sets }],
      unit: "lb",
    });
    expect(r.target && formatTargetSets(r.target, "lb")).toBe("105 lb × 8");
    // Logging exactly the target in pounds meets it.
    const done = [1, 2, 3].map(() => ({ set_type: "working" as const, weight_kg: fromUnit(105, "lb"), reps: 8, completed_at: "x" }));
    expect(r.target && targetMet(r.target, done)).toBe(true);
  });
});
