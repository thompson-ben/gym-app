import { describe, expect, it } from "vitest";
import { healthWorkoutWindow } from "@/lib/health";

const set = (completed_at: string | null) => ({ completed_at }) as never;
const doc = (started_at: string, ticks: (string | null)[], is_backdated = false) =>
  ({ started_at, is_backdated, exercises: [{ sets: ticks.map(set) }] }) as never;

describe("Apple Health workout window", () => {
  const now = new Date("2026-11-18T06:40:00Z");

  it("runs from the start to now when finished straight after the last set", () => {
    const w = healthWorkoutWindow(doc("2026-11-18T05:35:00Z", ["2026-11-18T06:00:00Z", "2026-11-18T06:38:00Z"]), now);
    expect(w).toEqual({ start: Date.parse("2026-11-18T05:35:00Z"), end: now.getTime() });
  });

  it("ends 5 minutes after the last set when the workout was left open", () => {
    const w = healthWorkoutWindow(doc("2026-11-18T05:35:00Z", ["2026-11-18T06:10:00Z"]), new Date("2026-11-18T09:00:00Z"));
    expect(w!.end).toBe(Date.parse("2026-11-18T06:15:00Z"));
  });

  it("skips past workouts logged later and workouts with no ticked set", () => {
    expect(healthWorkoutWindow(doc("2026-11-10T05:35:00Z", ["2026-11-18T06:38:00Z"], true), now)).toBeNull();
    expect(healthWorkoutWindow(doc("2026-11-18T05:35:00Z", [null, null]), now)).toBeNull();
  });

  it("is at least a minute long", () => {
    const w = healthWorkoutWindow(doc("2026-11-18T06:39:50Z", ["2026-11-18T06:39:55Z"]), now);
    expect(w!.end - w!.start).toBe(60_000);
  });
});

describe("estimated calories for Apple Health", () => {
  it("is about 3.5 kcal per kg per hour, capped at 4 hours, and 0 without a sensible body weight", async () => {
    const { estimateActiveKcal } = await import("@/lib/health");
    const w = (min: number) => ({ start: 0, end: min * 60_000 });
    expect(estimateActiveKcal(w(55), 80)).toBe(257);
    expect(estimateActiveKcal(w(60), 100)).toBe(350);
    expect(estimateActiveKcal(w(600), 80)).toBe(1120);
    expect(estimateActiveKcal(w(60), null)).toBe(0);
    expect(estimateActiveKcal(w(60), 12)).toBe(0);
  });
});
