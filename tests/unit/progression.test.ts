import { describe, expect, it } from "vitest";
import { computeTarget, formatTargetSets, type Candidate, type Prescription } from "@/lib/progression";
import type { PreviousSet } from "@/lib/types";

const P: Prescription = { targetSets: 3, repMin: 8, repMax: 12 };
const w = (weight_kg: number | null, reps: number): PreviousSet => ({ set_type: "working", weight_kg, reps });
const wu = (weight_kg: number, reps: number): PreviousSet => ({ set_type: "warmup", weight_kg, reps });
const cand = (sets: PreviousSet[], o: Partial<Candidate> = {}): Candidate => ({
  sessionId: "s1", templateExerciseId: "te1", completedAt: "2026-09-20T18:00:00Z", workoutName: "Upper A", prescription: P, sets, ...o,
});
const run = (candidates: Candidate[], o: Partial<Parameters<typeof computeTarget>[0]> = {}) =>
  computeTarget({ mode: "weight_reps", settings: { enabled: true, incrementKg: 2.5 }, prescription: P, entryId: "te1", candidates, ...o });

describe("computeTarget (double progression)", () => {
  it("adds the user's increment once every working set reaches the top of the range", () => {
    const r = run([cand([wu(20, 10), w(30, 12), w(30, 12), w(30, 12)])]);
    expect(r.target).toMatchObject({ weightKg: 32.5, reps: [8, 8, 8], kind: "increase", reason: "You reached the top of your rep range on all working sets." });
    expect(formatTargetSets(r.target!)).toBe("32.5 kg × 8");
  });

  it("uses the configured increment, never a hardcoded one", () => {
    expect(run([cand([w(30, 12), w(30, 12), w(30, 12)])], { settings: { enabled: true, incrementKg: 1 } }).target?.weightKg).toBe(31);
  });

  it("keeps the weight and aims for one more rep per set, capped at the top", () => {
    const r = run([cand([w(30, 12), w(30, 10), w(30, 9)])]);
    expect(r.target).toMatchObject({ weightKg: 30, reps: [12, 11, 10], kind: "repeat" });
    expect(formatTargetSets(r.target!)).toBe("30 kg × 12, 11, 10");
  });

  it("never lowers the weight, even below the rep range", () => {
    expect(run([cand([w(30, 6), w(30, 5), w(30, 5)])]).target).toMatchObject({ weightKg: 30, reps: [8, 8, 8] });
  });

  it("ignores extra sets beyond the working-set count and never counts warm-ups", () => {
    const r = run([cand([wu(30, 12), wu(30, 12), w(30, 12), w(30, 12), w(30, 12), w(30, 4)])]);
    expect(r.target?.kind).toBe("increase");
    // Warm-ups do not fill missing working sets.
    expect(run([cand([wu(30, 12), w(30, 12), w(30, 12)])]).target).toBeNull();
  });

  it("does not trigger on an incomplete session", () => {
    const r = run([cand([w(30, 12), w(30, 12)])]);
    expect(r.target).toBeNull();
    expect(r.target === null && r.note).toMatch(/2 of 3 working sets/);
  });

  it("does not guess when working sets used different weights", () => {
    expect(run([cand([w(30, 12), w(32.5, 12), w(30, 12)])]).target).toBeNull();
  });

  it("only compares performances with the same rep range and set count", () => {
    const changed = cand([w(30, 15), w(30, 15), w(30, 15)], { prescription: { targetSets: 3, repMin: 12, repMax: 15 } });
    expect(run([changed]).target).toBeNull();
    const fewer = cand([w(30, 12), w(30, 12)], { prescription: { targetSets: 2, repMin: 8, repMax: 12 } });
    expect(run([fewer]).target).toBeNull();
  });

  it("prefers the same workout entry and names another workout when it is the basis", () => {
    const same = cand([w(30, 10), w(30, 10), w(30, 10)], { sessionId: "old", completedAt: "2026-09-10T18:00:00Z" });
    const other = cand([w(30, 12), w(30, 12), w(30, 12)], { sessionId: "new", templateExerciseId: "te-other", workoutName: "Upper B" });
    expect(run([other, same]).target).toMatchObject({ kind: "repeat", basis: { sessionId: "old", sameEntry: true } });
    expect(run([other]).target).toMatchObject({ kind: "increase", basis: { workoutName: "Upper B", sameEntry: false } });
  });

  it("offers nothing for bodyweight or added-weight exercises", () => {
    const c = [cand([w(10, 12), w(10, 12), w(10, 12)])];
    expect(run(c, { mode: "added_weight_reps" }).target).toBeNull();
    expect(run(c, { mode: "bodyweight_reps" }).target).toBeNull();
  });

  it("is off unless opted in, and needs an increment and a full prescription", () => {
    const c = [cand([w(30, 12), w(30, 12), w(30, 12)])];
    expect(run(c, { settings: { enabled: false, incrementKg: 2.5 } })).toEqual({ target: null, note: null });
    expect(run(c, { settings: { enabled: true, incrementKg: null } }).target).toBeNull();
    expect(run(c, { prescription: { targetSets: 3, repMin: null, repMax: 12 } }).target).toBeNull();
  });

  it("has no basis without history", () => {
    expect(run([]).target).toBeNull();
  });
});

import { targetMet, topOfRangeLastTime, topOfRangeNow } from "@/lib/progression";

describe("ready-to-progress nudge and target celebration", () => {
  const done = (weight_kg: number, reps: number, set_type: "working" | "warmup" = "working") => ({ set_type, weight_kg, reps, completed_at: "x" });
  const open = (weight_kg: number, reps: number | null) => ({ set_type: "working" as const, weight_kg, reps, completed_at: null });

  it("nudges only when every planned working set reached the top of the range last time", () => {
    const p = { targetSets: 3, repMin: 12, repMax: 20 };
    expect(topOfRangeLastTime("weight_reps", p, [w(6.25, 20), w(6.25, 20), w(6.25, 20)])).toBe(20);
    expect(topOfRangeLastTime("weight_reps", p, [w(6.25, 20), w(6.25, 20), w(6.25, 12)])).toBeNull();
    expect(topOfRangeLastTime("weight_reps", p, [wu(6.25, 20), w(6.25, 20), w(6.25, 20)])).toBeNull();
    expect(topOfRangeLastTime("added_weight_reps", p, [w(5, 20), w(5, 20), w(5, 21)])).toBe(20);
    expect(topOfRangeLastTime("bodyweight_reps", p, [w(0, 20), w(0, 20), w(0, 20)])).toBeNull();
    expect(topOfRangeLastTime("weight_reps", { ...p, repMax: null }, [w(6.25, 20)])).toBeNull();
  });

  it("celebrates a target only when every target set is met or beaten and confirmed", () => {
    const t = { weightKg: 32.5, reps: [8, 8, 8] };
    expect(targetMet(t, [done(32.5, 8), done(32.5, 9), done(35, 8)])).toBe(true);
    expect(targetMet(t, [done(32.5, 8), done(32.5, 7), done(32.5, 8)])).toBe(false);
    expect(targetMet(t, [done(30, 12), done(32.5, 8), done(32.5, 8)])).toBe(false);
    expect(targetMet(t, [done(32.5, 8), done(32.5, 8), open(32.5, 8)])).toBe(false);
    expect(targetMet(t, [done(40, 10, "warmup"), done(32.5, 8), done(32.5, 8)])).toBe(false);
  });

  it("recognises the top of the range this session without targets", () => {
    const p = { targetSets: 2, repMin: 8, repMax: 12 };
    expect(topOfRangeNow("weight_reps", p, [done(30, 12), done(30, 13)])).toBe(true);
    expect(topOfRangeNow("weight_reps", p, [done(30, 12), open(30, 12)])).toBe(false);
    expect(topOfRangeNow("bodyweight_reps", p, [done(0, 12), done(0, 12)])).toBe(false);
  });
});
