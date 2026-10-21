import { describe, expect, it } from "vitest";
import { completeSet, updateSet } from "@/lib/session/doc";
import { endsRound, nextInSuperset, supersetLabels, supersetRanges } from "@/lib/supersets";
import type { SessionDoc, SessionExercise } from "@/lib/types";

const ex = (id: string, sets: number, superset_next = false, skipped = false): SessionExercise => ({
  id, exercise_id: id, template_exercise_id: null, position: 0, exercise_name: id, tracking_mode: "weight_reps",
  target_sets: sets, rep_min: 8, rep_max: 12, rest_seconds: 90, template_notes: null, notes: null, skipped, superset_next,
  sets: Array.from({ length: sets }, (_, i) => ({ id: `${id}${i + 1}`, position: i, set_type: "working" as const, weight_kg: 50, reps: 10, completed_at: null })),
});
const doc = (exercises: SessionExercise[]): SessionDoc => ({
  id: "s", status: "in_progress", revision: 0, split_id: null, template_id: null, split_name: null, template_name: "W",
  started_at: "2026-10-21T18:00:00Z", completed_at: null, notes: null, exercises,
});
const tick = (d: SessionDoc, e: string, s: string) => {
  const r = completeSet(d, e, s, new Date());
  if (!("doc" in r)) throw new Error(r.error);
  return r.doc;
};

describe("supersets", () => {
  it("finds runs of linked exercises and labels them A1, A2, B1…", () => {
    const items = [{}, { superset_next: true }, {}, { superset_next: true }, { superset_next: true }, {}, { superset_next: true }];
    expect(supersetRanges(items)).toEqual([[1, 2], [3, 5]]);
    expect(supersetLabels(items)).toEqual([null, "A1", "A2", "B1", "B2", "B3", null]);
    // A link on the last exercise means nothing.
    expect(supersetLabels([{ superset_next: true }])).toEqual([null]);
    expect(supersetLabels([])).toEqual([]);
  });

  it("goes A1 → A2 → A1 round by round, and rests only after each round", () => {
    let d = doc([ex("squat", 3), ex("bench", 3, true), ex("row", 3)]);
    expect(nextInSuperset(d, "squat")).toBeNull();
    expect(endsRound(d, "squat")).toBe(true);

    d = tick(d, "bench", "bench1");
    expect(nextInSuperset(d, "bench")).toEqual({ entryId: "row", setId: "row1" });
    expect(endsRound(d, "bench")).toBe(false); // no rest between bench and row
    d = tick(d, "row", "row1");
    expect(nextInSuperset(d, "row")).toEqual({ entryId: "bench", setId: "bench2" });
    expect(endsRound(d, "row")).toBe(true); // rest after the round
  });

  it("passes over skipped and finished exercises, and ends when the superset is done", () => {
    let d = doc([ex("a", 2, true), ex("b", 1, true), ex("c", 2, false, true)]);
    d = tick(d, "a", "a1");
    expect(nextInSuperset(d, "a")).toEqual({ entryId: "b", setId: "b1" });
    d = tick(d, "b", "b1");
    // b is finished and c skipped, so it's back to a.
    expect(nextInSuperset(d, "b")).toEqual({ entryId: "a", setId: "a2" });
    d = tick(d, "a", "a2");
    expect(nextInSuperset(d, "a")).toBeNull();
    expect(endsRound(d, "a")).toBe(true);
    // Untouched by the reps edit helper.
    expect(updateSet(d, "a", "a1", { reps: 9 }).exercises[0].superset_next).toBe(true);
  });
});
