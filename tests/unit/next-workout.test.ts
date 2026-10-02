import { describe, expect, it } from "vitest";
import { suggestNextWorkout, type SplitWorkout } from "@/lib/next-workout";

const w = (id: string, position: number, lastPerformed: string | null, exerciseCount = 4): SplitWorkout => ({ id, name: id, position, exerciseCount, lastPerformed });

describe("suggestNextWorkout (longest ago in the active split)", () => {
  it("starts a brand-new split at its first workout", () => {
    expect(suggestNextWorkout([w("chest", 0, null), w("legs", 1, null), w("arms", 2, null)])).toMatchObject({ templateId: "chest", reason: "First in your split order" });
  });

  it("suggests the workout performed longest ago, whatever the split order", () => {
    // Done: legs 20 Sep, chest 18 Sep, arms 24 Sep → chest is the oldest.
    const r = suggestNextWorkout([w("chest", 0, "2026-09-18T18:00:00Z"), w("legs", 1, "2026-09-20T18:00:00Z"), w("arms", 2, "2026-09-24T18:00:00Z")]);
    expect(r).toMatchObject({ kind: "next", templateId: "chest" });
    expect(r.reason).toBe("Done longest ago in this split (last 2026-09-18)");
  });

  it("puts a workout never done first, in split order", () => {
    expect(suggestNextWorkout([w("chest", 0, "2026-09-18"), w("legs", 1, null), w("arms", 2, null)])).toMatchObject({ templateId: "legs", reason: "Not done yet in this split" });
  });

  it("uses the date performed, so a past workout logged later sits on its own date", () => {
    // Arms was logged today but performed on 10 Sep, so it is still the oldest.
    expect(suggestNextWorkout([w("chest", 0, "2026-09-18"), w("arms", 1, "2026-09-10")])).toMatchObject({ templateId: "arms" });
  });

  it("breaks ties by split order and skips workouts without exercises", () => {
    expect(suggestNextWorkout([w("b", 1, "2026-09-18"), w("a", 0, "2026-09-18")])).toMatchObject({ templateId: "a" });
    expect(suggestNextWorkout([w("empty", 0, null, 0), w("a", 1, "2026-09-18"), w("b", 2, "2026-09-20")])).toMatchObject({ templateId: "a" });
    expect(suggestNextWorkout([w("empty", 0, null, 0)]).kind).toBe("choose");
  });

  it("handles a single-workout split", () => {
    expect(suggestNextWorkout([w("a", 0, "2026-09-18")])).toMatchObject({ kind: "only", templateId: "a" });
  });
});
