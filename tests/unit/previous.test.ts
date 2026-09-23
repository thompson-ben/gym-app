import { describe, expect, it } from "vitest";
import { matchPrevious, suggestWeight } from "@/lib/session/previous";
import type { PreviousSet } from "@/lib/types";

const w = (weight_kg: number, reps: number): PreviousSet => ({ set_type: "working", weight_kg, reps });
const wu = (weight_kg: number, reps: number): PreviousSet => ({ set_type: "warmup", weight_kg, reps });

describe("matchPrevious", () => {
  it("pairs working sets by index and leaves extra sets empty", () => {
    const prev = [w(72.5, 9), w(72.5, 6)];
    const rows = [{ set_type: "working" as const }, { set_type: "working" as const }, { set_type: "working" as const }];
    expect(matchPrevious(rows, prev)).toEqual([w(72.5, 9), w(72.5, 6), null]);
  });

  it("matches warm-ups with warm-ups and working sets with working sets", () => {
    const prev = [wu(40, 10), w(72.5, 9), w(72.5, 6)];
    const rows = [{ set_type: "working" as const }, { set_type: "working" as const }];
    expect(matchPrevious(rows, prev)).toEqual([w(72.5, 9), w(72.5, 6)]);
    expect(matchPrevious([{ set_type: "warmup" }, { set_type: "warmup" }], prev)).toEqual([wu(40, 10), null]);
  });

  it("returns empty cells for a new exercise", () => {
    expect(matchPrevious([{ set_type: "working" }], undefined)).toEqual([null]);
  });
});

describe("suggestWeight", () => {
  it("uses the matched set, then falls back to the last set of the same type", () => {
    const prev = [w(72.5, 9), w(70, 6)];
    expect(suggestWeight("weight_reps", prev[0], prev, "working")).toBe(72.5);
    expect(suggestWeight("weight_reps", null, prev, "working")).toBe(70);
    expect(suggestWeight("weight_reps", null, prev, "warmup")).toBeNull();
    expect(suggestWeight("bodyweight_reps", prev[0], prev, "working")).toBeNull();
    expect(suggestWeight("added_weight_reps", w(10, 10), [w(10, 10)], "working")).toBe(10);
  });
});
