import type { SessionDoc, SessionExercise, TrackingMode } from "@/lib/types";

let n = 0;
export const seqId = () => `id-${++n}`;

export function exercise(partial: Partial<SessionExercise> & { exercise_id: string; tracking_mode?: TrackingMode }): SessionExercise {
  return {
    id: seqId(),
    template_exercise_id: null,
    position: 0,
    exercise_name: partial.exercise_id,
    tracking_mode: "weight_reps",
    target_sets: 2,
    rep_min: 8,
    rep_max: 12,
    rest_seconds: 120,
    template_notes: null,
    notes: null,
    skipped: false,
    sets: [],
    ...partial,
  };
}

export function session(exercises: SessionExercise[]): SessionDoc {
  return {
    id: "session-1",
    status: "in_progress",
    revision: 0,
    split_id: "split",
    template_id: "tpl",
    split_name: "My 3-day split",
    template_name: "Chest & back",
    started_at: "2026-09-23T17:00:00.000Z",
    completed_at: null,
    notes: null,
    exercises,
  };
}

export class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
