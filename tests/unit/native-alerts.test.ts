import { describe, expect, it } from "vitest";
import { restAlertAt } from "@/lib/native-alerts";

describe("rest-over alert", () => {
  it("fires when the rest ends, and not at all without a rest or once the workout is closed", () => {
    const timer = { startedAt: 1_000_000, duration: 90 };
    expect(restAlertAt(timer, false)).toBe(1_090_000);
    expect(restAlertAt({ ...timer, duration: 105 }, false)).toBe(1_105_000);
    expect(restAlertAt(null, false)).toBeNull();
    expect(restAlertAt(timer, true)).toBeNull();
  });
});
