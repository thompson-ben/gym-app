import { describe, expect, it } from "vitest";
import { bestSetLabel, shareCard } from "@/lib/share-card";
import type { SessionDoc, SessionExercise } from "@/lib/types";

const ex = (name: string, mode: SessionExercise["tracking_mode"], sets: [number | null, number][], type: "working" | "warmup" = "working"): SessionExercise => ({
  id: name, exercise_id: name, template_exercise_id: null, position: 0, exercise_name: name, tracking_mode: mode,
  target_sets: 3, rep_min: 6, rep_max: 10, rest_seconds: 90, template_notes: null, notes: null, skipped: false,
  sets: sets.map(([w, r], i) => ({ id: `${name}${i}`, position: i, set_type: type, weight_kg: w, reps: r, completed_at: "2026-10-20T18:00:00Z" })),
});
const doc = (exercises: SessionExercise[]): SessionDoc => ({
  id: "s", status: "completed", revision: 1, split_id: null, template_id: null, split_name: "Push / Pull / Legs", template_name: "Push",
  started_at: "2026-10-20T17:00:00Z", completed_at: "2026-10-20T18:00:00Z", notes: null, exercises,
});

describe("share card", () => {
  it("shows the best working set per exercise, the stats and new records (not baselines)", () => {
    const card = shareCard(
      doc([
        ex("Bench press", "weight_reps", [[60, 10], [62.5, 8], [62.5, 6]]),
        ex("Bench press warm-up", "weight_reps", [[40, 10]], "warmup"),
        ex("Dips", "bodyweight_reps", [[null, 12], [null, 15]]),
        ex("Weighted dips", "added_weight_reps", [[10, 8]]),
        ex("Plank", "duration", [[null, 45], [null, 60]]),
      ]),
      [
        { kind: "heaviest", label: "Heaviest load", detail: "62.5 kg (previous 60 kg)", exercise: "Bench press" },
        { kind: "first", label: "First recorded performance", detail: "Your baseline for this exercise is set.", exercise: "Plank" },
      ],
      { unit: "kg", date: "Tue 20 Oct", durationMinutes: 58, previous: { "Bench press": [{ set_type: "working", weight_kg: 60, reps: 10 }, { set_type: "warmup", weight_kg: 80, reps: 3 }] } },
    );
    expect(card.title).toBe("Push");
    expect(card.eyebrow).toBe("Push / Pull / Legs · Tue 20 Oct");
    expect(card.stats).toBe("4 exercises · 8 sets · 58 min");
    expect(card.lines).toEqual([
      { name: "Bench press", best: "62.5 kg × 8", previous: "60 kg × 10" },
      { name: "Dips", best: "15 reps", previous: null },
      { name: "Weighted dips", best: "+10 kg × 8", previous: null },
      { name: "Plank", best: "60 s", previous: null },
    ]);
    expect(card.records).toEqual(["Bench press: heaviest load 62.5 kg"]);
    expect(card.more).toBe(0);
  });

  it("caps the list and converts to pounds", () => {
    const many = Array.from({ length: 8 }, (_, i) => ex(`Lift ${i}`, "weight_reps", [[100, 5]]));
    const card = shareCard(doc(many), [], { unit: "lb", date: "", durationMinutes: null });
    expect(card.lines).toHaveLength(6);
    expect(card.more).toBe(2);
    expect(card.lines[0].best).toBe("220.46 lb × 5");
    expect(bestSetLabel("added_weight_reps", 0, 10, "kg")).toBe("BW × 10");
  });
});
