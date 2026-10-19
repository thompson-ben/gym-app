import { describe, expect, it } from "vitest";
import { buildDemo, cameFromDemo, parseSavedDemo } from "@/lib/demo";
import { completeSet, summarize, updateSet } from "@/lib/session/doc";
import { isPublicPath } from "@/lib/attribution";

let n = 0;
const id = () => `id-${n++}`;
const now = new Date("2026-10-19T18:00:00Z");

describe("try-a-workout demo", () => {
  it("builds three exercises from Full Body A with sets planned from the example numbers", () => {
    const { doc, previous } = buildDemo(now, id);
    expect(doc.template_name).toBe("Full Body A");
    expect(doc.exercises.map((e) => e.exercise_name)).toEqual(["Back squat", "Barbell bench press", "Seated cable row"]);
    const bench = doc.exercises[1];
    expect(bench.sets).toHaveLength(3);
    expect(bench.sets.every((s) => s.weight_kg === 60 && s.reps === null && !s.completed_at)).toBe(true);
    expect(previous[bench.exercise_id]?.sets.map((s) => s.reps)).toEqual([10, 10, 10]);
    expect(previous[bench.exercise_id]?.completed_at).toBe("2026-10-15T18:00:00.000Z");
    expect(summarize(doc)).toMatchObject({ completedSets: 0, plannedSets: 9 });
  });

  it("logs with the real session rules and round-trips through storage", () => {
    const { doc } = buildDemo(now, id);
    const ex = doc.exercises[0];
    expect(completeSet(doc, ex.id, ex.sets[0].id, now)).toEqual({ error: "reps_required" });
    const withReps = updateSet(doc, ex.id, ex.sets[0].id, { reps: 8 });
    const r = completeSet(withReps, ex.id, ex.sets[0].id, now);
    if (!("doc" in r)) throw new Error("not completed");
    expect(summarize(r.doc).completedSets).toBe(1);
    expect(parseSavedDemo(JSON.stringify(r.doc))).toEqual(r.doc);
    expect(parseSavedDemo("{not json")).toBeNull();
    expect(parseSavedDemo(JSON.stringify({ id: "other", exercises: [] }))).toBeNull();
    expect(parseSavedDemo(null)).toBeNull();
  });

  it("knows who came from the demo, and the new pages count as public", () => {
    expect(cameFromDemo({ via: "demo" }, undefined)).toBe(true);
    expect(cameFromDemo(null, "full-body")).toBe(true);
    expect(cameFromDemo({}, undefined)).toBe(false);
    expect(isPublicPath("/try")).toBe(true);
    expect(isPublicPath("/add-weight")).toBe(true);
  });
});
