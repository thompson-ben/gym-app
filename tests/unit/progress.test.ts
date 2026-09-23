import { describe, expect, it } from "vitest";
import { heaviestSetPerSession, type HistorySession } from "@/lib/progress";

const session = (id: string, date: string, sets: HistorySession["sets"]): HistorySession => ({
  session_id: id, completed_at: date, template_name: "Chest & back", split_name: "S", split_id: null, sets,
});

describe("heaviestSetPerSession", () => {
  it("reports the heaviest working set per session with its reps, oldest first", () => {
    const points = heaviestSetPerSession(
      [
        session("b", "2026-09-21T17:00:00Z", [
          { set_type: "warmup", weight_kg: 100, reps: 1 }, // warm-ups never count
          { set_type: "working", weight_kg: 72.5, reps: 9 },
          { set_type: "working", weight_kg: 72.5, reps: 6 },
        ]),
        session("a", "2026-09-14T17:00:00Z", [{ set_type: "working", weight_kg: 70, reps: 10 }]),
        session("c", "2026-09-28T17:00:00Z", [{ set_type: "warmup", weight_kg: 40, reps: 10 }]),
      ],
      "weight_reps",
    );
    expect(points.map((p) => [p.sessionId, p.value, p.reps])).toEqual([["a", 70, 10], ["b", 72.5, 9]]);
  });

  it("uses reps for reps-only exercises", () => {
    const [p] = heaviestSetPerSession([session("a", "2026-09-14T17:00:00Z", [{ set_type: "working", weight_kg: null, reps: 15 }, { set_type: "working", weight_kg: null, reps: 12 }])], "bodyweight_reps");
    expect(p.value).toBe(15);
  });
});
