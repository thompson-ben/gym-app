import { describe, expect, it } from "vitest";
import { adjustTimer, remainingSeconds, startTimer } from "@/lib/timer";

describe("rest timer (scenario I)", () => {
  it("derives remaining time from timestamps, so backgrounding does not freeze it", () => {
    const t0 = 1_000_000;
    const timer = startTimer(120, t0);
    // No ticks happen while the app is in the background; on return only "now" matters.
    expect(remainingSeconds(timer, t0 + 45_000)).toBe(75);
    expect(remainingSeconds(timer, t0 + 10 * 60_000)).toBe(0);
    expect(remainingSeconds(null, t0)).toBeNull();
  });

  it("adjusts a running timer without restarting it", () => {
    const t0 = 0;
    const timer = adjustTimer(startTimer(90, t0), 15, 30_000);
    expect(remainingSeconds(timer, 30_000)).toBe(75);
    const shorter = adjustTimer(timer, -500, 30_000);
    expect(remainingSeconds(shorter, 30_000)).toBeGreaterThan(0);
  });
});
