import { describe, expect, it } from "vitest";
import {
  addSet,
  completeSet,
  ensurePlannedSets,
  removeSet,
  setSkipped,
  substituteExercise,
  summarize,
  toPayload,
  uncompleteSet,
  updateSet,
} from "@/lib/session/doc";
import type { Exercise, PreviousMap } from "@/lib/types";
import { exercise, seqId, session } from "./fixtures";

const previous: PreviousMap = {
  incline: {
    exercise_id: "incline",
    session_id: "s0",
    completed_at: "2026-09-21T17:05:00Z",
    template_name: "Chest & back",
    split_name: "My 3-day split",
    sets: [
      { set_type: "working", weight_kg: 72.5, reps: 9 },
      { set_type: "working", weight_kg: 72.5, reps: 6 },
    ],
  },
};
const now = new Date("2026-09-23T17:10:00Z");

function started() {
  return ensurePlannedSets(
    session([exercise({ exercise_id: "incline", target_sets: 3 }), exercise({ exercise_id: "dip", tracking_mode: "added_weight_reps" })]),
    previous,
    seqId,
  );
}

describe("planned sets (scenario F)", () => {
  it("prefills weights from the previous session but leaves reps empty and unconfirmed", () => {
    const doc = started();
    const incline = doc.exercises[0];
    expect(incline.sets.map((s) => [s.weight_kg, s.reps, s.completed_at])).toEqual([
      [72.5, null, null],
      [72.5, null, null],
      [72.5, null, null], // fallback suggestion for the extra set
    ]);
    expect(summarize(doc).completedSets).toBe(0);
    const payload = toPayload(doc);
    expect(payload.exercises.flatMap((e) => e.sets).every((s) => s.completed_at === null)).toBe(true);
  });

  it("refuses to confirm a set without reps, and confirms explicitly", () => {
    let doc = started();
    const [ex] = doc.exercises;
    expect(completeSet(doc, ex.id, ex.sets[0].id, now)).toEqual({ error: "reps_required" });
    doc = updateSet(doc, ex.id, ex.sets[0].id, { reps: 10 });
    const result = completeSet(doc, ex.id, ex.sets[0].id, now);
    if (!("doc" in result)) throw new Error("expected success");
    expect(result.doc.exercises[0].sets[0]).toMatchObject({ weight_kg: 72.5, reps: 10, completed_at: now.toISOString() });
    expect(summarize(result.doc).completedSets).toBe(1);
    const undone = uncompleteSet(result.doc, ex.id, ex.sets[0].id);
    expect(summarize(undone).completedSets).toBe(0);
  });

  it("requires a weight for loaded exercises and treats empty added weight as bodyweight", () => {
    let doc = started();
    const [incline, dip] = doc.exercises;
    doc = updateSet(doc, incline.id, incline.sets[0].id, { weight_kg: null, reps: 8 });
    expect(completeSet(doc, incline.id, incline.sets[0].id, now)).toEqual({ error: "weight_required" });
    doc = updateSet(doc, dip.id, dip.sets[0].id, { reps: 10 });
    const r = completeSet(doc, dip.id, dip.sets[0].id, now);
    if (!("doc" in r)) throw new Error("expected success");
    expect(r.doc.exercises[1].sets[0].weight_kg).toBe(0);
  });

  it("adds warm-ups before working sets and removes sets", () => {
    let doc = started();
    const ex = doc.exercises[0];
    doc = addSet(doc, ex.id, "warmup", previous, seqId);
    expect(doc.exercises[0].sets.map((s) => s.set_type)).toEqual(["warmup", "working", "working", "working"]);
    expect(doc.exercises[0].sets[0].weight_kg).toBeNull(); // no previous warm-up to suggest from
    doc = removeSet(doc, ex.id, doc.exercises[0].sets[0].id);
    expect(doc.exercises[0].sets.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("skipping keeps confirmed sets and drops unconfirmed rows", () => {
    let doc = started();
    const ex = doc.exercises[0];
    doc = updateSet(doc, ex.id, ex.sets[0].id, { reps: 9 });
    const r = completeSet(doc, ex.id, ex.sets[0].id, now);
    if (!("doc" in r)) throw new Error();
    doc = setSkipped(r.doc, ex.id, true);
    expect(doc.exercises[0].sets).toHaveLength(1);
    expect(summarize(doc).exercises[0]).toMatchObject({ completed: 1, unconfirmed: 0, skipped: true });
  });

  it("substitutes only exercises without confirmed sets, keeping targets", () => {
    const doc = started();
    const replacement: Exercise = {
      id: "db-incline", owner_id: null, slug: "incline-dumbbell-press", name: "Incline Dumbbell Press", variant: null,
      primary_muscle: "chest", equipment: "dumbbell", tracking_mode: "weight_reps", aliases: [], origin_exercise_id: null, archived_at: null,
    };
    const r = substituteExercise(doc, doc.exercises[0].id, replacement, {}, seqId);
    if (!("doc" in r)) throw new Error();
    expect(r.doc.exercises[0]).toMatchObject({ exercise_id: "db-incline", target_sets: 3, rep_min: 8 });
    expect(r.doc.exercises[0].sets.every((s) => s.weight_kg === null)).toBe(true); // no history for it

    const edited = updateSet(doc, doc.exercises[0].id, doc.exercises[0].sets[0].id, { reps: 9 });
    const done = completeSet(edited, doc.exercises[0].id, doc.exercises[0].sets[0].id, now);
    if (!("doc" in done)) throw new Error();
    expect(substituteExercise(done.doc, doc.exercises[0].id, replacement, {}, seqId)).toEqual({ error: "has_completed_sets" });
  });
});

describe("weight carries forward to following sets", () => {
  const fresh = () => ensurePlannedSets(session([exercise({ exercise_id: "hack", target_sets: 3 })]), {}, seqId);
  const weights = (d: ReturnType<typeof fresh>) => d.exercises[0].sets.map((s) => s.weight_kg);

  it("fills later empty sets as set 1 is typed, keystroke by keystroke", () => {
    let d = fresh();
    const [s1] = d.exercises[0].sets;
    expect(weights(d)).toEqual([null, null, null]);
    d = updateSet(d, d.exercises[0].id, s1.id, { weight_kg: 5 });
    d = updateSet(d, d.exercises[0].id, s1.id, { weight_kg: 50 });
    expect(weights(d)).toEqual([50, 50, 50]);
  });

  it("keeps a weight the user set on a later set, and never changes confirmed sets", () => {
    let d = fresh();
    const [s1, s2, s3] = d.exercises[0].sets;
    const ex = d.exercises[0].id;
    d = updateSet(d, ex, s1.id, { weight_kg: 50 });
    d = updateSet(d, ex, s3.id, { weight_kg: 45 }); // deliberate drop set
    d = updateSet(d, ex, s1.id, { weight_kg: 55 });
    expect(weights(d)).toEqual([55, 55, 45]);

    d = updateSet(d, ex, s2.id, { reps: 10 });
    const done = completeSet(d, ex, s2.id, new Date());
    if (!("doc" in done)) throw new Error();
    d = updateSet(done.doc, ex, s1.id, { weight_kg: 60 });
    expect(weights(d)).toEqual([60, 55, 45]);
  });

  it("follows prefilled weights from last time and leaves warm-ups alone", () => {
    let d = ensurePlannedSets(session([exercise({ exercise_id: "incline", target_sets: 2 })]), previous, seqId);
    const ex = d.exercises[0].id;
    d = addSet(d, ex, "warmup", previous, seqId);
    const working = d.exercises[0].sets.filter((s) => s.set_type === "working");
    d = updateSet(d, ex, working[0].id, { weight_kg: 75 });
    expect(d.exercises[0].sets.map((s) => [s.set_type, s.weight_kg])).toEqual([
      ["warmup", null],
      ["working", 75],
      ["working", 75],
    ]);
  });

  it("a new set starts from the set above it in this session", () => {
    let d = fresh();
    const ex = d.exercises[0].id;
    d = updateSet(d, ex, d.exercises[0].sets[2].id, { weight_kg: 40 });
    d = addSet(d, ex, "working", {}, seqId);
    expect(weights(d).at(-1)).toBe(40);
  });
});
