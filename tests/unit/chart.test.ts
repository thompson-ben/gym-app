import { describe, expect, it } from "vitest";
import { niceTicks } from "@/lib/chart";

describe("niceTicks", () => {
  it("always covers the highest and lowest values", () => {
    for (const [lo, hi] of [[35.5, 52.57], [41, 43], [0, 1], [70, 72.5], [100, 180], [29, 31]]) {
      const ticks = niceTicks(lo, hi);
      expect(ticks[0]).toBeLessThanOrEqual(lo);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(hi);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it("uses round steps", () => {
    expect(niceTicks(35.5, 52.57)).toEqual([35, 40, 45, 50, 55]);
  });
});
