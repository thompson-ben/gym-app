import { describe, expect, it } from "vitest";
import { formatSet, formatTarget, fromLocalInput, toLocalInput } from "@/lib/format";
import { parseReps, parseWeight } from "@/lib/validation";

describe("formatting", () => {
  it("formats previous sets by tracking mode, labelling added weight", () => {
    expect(formatSet("weight_reps", 72.5, 9)).toBe("72.5 × 9");
    expect(formatSet("added_weight_reps", 10, 10)).toBe("+10 × 10");
    expect(formatSet("added_weight_reps", 0, 12)).toBe("BW × 12");
    expect(formatSet("bodyweight_reps", null, 15)).toBe("15 reps");
    expect(formatTarget(2, 8, 12)).toBe("2 × 8–12");
    expect(formatTarget(3, 5, 5)).toBe("3 × 5");
  });

  it("round-trips datetime-local values through a time zone, across DST", () => {
    for (const iso of ["2026-09-21T16:05:00.000Z", "2026-03-29T00:30:00.000Z", "2026-01-10T23:59:00.000Z"]) {
      expect(fromLocalInput(toLocalInput(iso, "Europe/London"), "Europe/London")).toBe(iso);
      expect(fromLocalInput(toLocalInput(iso, "Australia/Sydney"), "Australia/Sydney")).toBe(iso);
    }
    expect(toLocalInput("2026-09-21T16:05:00.000Z", "Europe/London")).toBe("2026-09-21T17:05");
  });
});

describe("input validation", () => {
  it("accepts decimal weights and integer reps only", () => {
    expect(parseWeight("72.5")).toBe(72.5);
    expect(parseWeight("72,5")).toBe(72.5);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("abc")).toBeNaN();
    expect(parseWeight("1e3")).toBeNaN();
    expect(parseWeight("-5")).toBeNaN();
    expect(parseWeight("5000")).toBeNaN();
    expect(parseReps("9")).toBe(9);
    expect(parseReps("9.5")).toBeNaN();
    expect(parseReps("")).toBeNull();
  });
});
