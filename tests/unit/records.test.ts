import { describe, expect, it } from "vitest";
import { compareWithPrevious, recordsFor, type DatedSets } from "@/lib/records";
import type { PreviousSet } from "@/lib/types";

const w = (weight_kg: number | null, reps: number): PreviousSet => ({ set_type: "working", weight_kg, reps });
const wu = (weight_kg: number, reps: number): PreviousSet => ({ set_type: "warmup", weight_kg, reps });
const d = (sessionId: string, performedAt: string, sets: PreviousSet[]): DatedSets => ({ sessionId, performedAt, sets });
const kinds = (r: { kind: string }[]) => r.map((x) => x.kind);

describe("recordsFor", () => {
  it("marks the first recorded performance and nothing else", () => {
    const cur = d("a", "2026-09-01", [w(30, 10)]);
    expect(recordsFor("weight_reps", cur, [cur])).toEqual([expect.objectContaining({ kind: "first" })]);
  });

  it("finds heaviest load, rep record at a load and estimated 1RM", () => {
    const hist = [d("a", "2026-09-01", [w(30, 10), w(32.5, 6)])];
    expect(kinds(recordsFor("weight_reps", d("b", "2026-09-08", [w(35, 5)]), hist))).toEqual(["heaviest", "e1rm"]);
    expect(kinds(recordsFor("weight_reps", d("b", "2026-09-08", [w(30, 11)]), hist))).toEqual(["reps_at_load", "e1rm"]);
  });

  it("never announces ties", () => {
    const hist = [d("a", "2026-09-01", [w(30, 10)])];
    expect(recordsFor("weight_reps", d("b", "2026-09-08", [w(30, 10)]), hist)).toEqual([]);
  });

  it("ignores warm-ups on both sides", () => {
    const hist = [d("a", "2026-09-01", [wu(60, 5), w(30, 10)])];
    expect(kinds(recordsFor("weight_reps", d("b", "2026-09-08", [wu(100, 1), w(30, 10)]), hist))).toEqual([]);
    expect(recordsFor("weight_reps", d("c", "2026-09-08", [wu(30, 10)]), hist)).toEqual([]);
  });

  it("excludes high-rep sets from the estimated 1RM", () => {
    const hist = [d("a", "2026-09-01", [w(30, 10)])];
    // 25 × 25 would "estimate" 45.8 kg; it is not eligible, and 25 kg was never done before.
    expect(kinds(recordsFor("weight_reps", d("b", "2026-09-08", [w(25, 25)]), hist))).toEqual([]);
  });

  it("compares only with sessions performed earlier, so editing history updates records", () => {
    const later = d("z", "2026-09-20", [w(40, 5)]);
    const cur = d("b", "2026-09-08", [w(35, 5)]);
    expect(kinds(recordsFor("weight_reps", cur, [d("a", "2026-09-01", [w(30, 10)]), later]))).toContain("heaviest");
    // If the earlier session is edited to 36 kg the record disappears.
    expect(kinds(recordsFor("weight_reps", cur, [d("a", "2026-09-01", [w(36, 5)]), later]))).not.toContain("heaviest");
  });

  it("uses most reps for reps-only exercises and added load for weighted ones", () => {
    expect(kinds(recordsFor("bodyweight_reps", d("b", "2", [w(null, 16)]), [d("a", "1", [w(null, 15)])]))).toEqual(["most_reps"]);
    const r = recordsFor("added_weight_reps", d("b", "2", [w(12.5, 8)]), [d("a", "1", [w(10, 10)])]);
    expect(r[0]).toMatchObject({ kind: "heaviest", detail: "+12.5 kg (previous +10 kg)" });
    expect(kinds(r)).not.toContain("e1rm");
  });
});

describe("compareWithPrevious", () => {
  it("states rep changes at the same load", () => {
    expect(compareWithPrevious("weight_reps", [w(30, 10), w(30, 9)], [w(30, 9), w(30, 8)])).toBe("2 more reps at 30 kg");
    expect(compareWithPrevious("weight_reps", [w(30, 8)], [w(30, 9)])).toBe("1 fewer rep at 30 kg");
  });

  it("does not call extra sets better", () => {
    expect(compareWithPrevious("weight_reps", [w(30, 10), w(30, 10), w(30, 10)], [w(30, 10), w(30, 10)])).toBe("Same reps at 30 kg as last time");
  });

  it("reports load changes", () => {
    expect(compareWithPrevious("weight_reps", [w(32.5, 8)], [w(30, 12)])).toBe("Up from 30 kg to 32.5 kg");
  });

  it("returns nothing without a previous performance", () => {
    expect(compareWithPrevious("weight_reps", [w(30, 8)], undefined)).toBeNull();
  });
});
