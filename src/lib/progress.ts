import type { PreviousSet, TrackingMode } from "./types";

export type HistorySession = {
  session_id: string;
  completed_at: string;
  template_name: string;
  split_name: string | null;
  split_id: string | null;
  sets: PreviousSet[];
};

export type ProgressPoint = {
  sessionId: string;
  date: string;
  /** Heaviest load of a completed working set (or most reps for reps-only exercises). */
  value: number;
  /** Reps of that set (the heaviest set with the most reps when loads tie). */
  reps: number;
  workout: string;
};

/**
 * One point per session: the heaviest completed *working* set. Warm-ups are ignored. When
 * several sets share the top load, the one with the most reps is reported. This is a load
 * metric only; it does not claim that a heavier set is a better performance.
 */
export function heaviestSetPerSession(history: HistorySession[], mode: TrackingMode): ProgressPoint[] {
  const points: ProgressPoint[] = [];
  for (const s of history) {
    const working = s.sets.filter((x) => x.set_type === "working");
    if (!working.length) continue;
    const metric = (x: PreviousSet) => (mode === "bodyweight_reps" ? x.reps : (x.weight_kg ?? 0));
    const best = working.reduce((a, b) => (metric(b) > metric(a) || (metric(b) === metric(a) && b.reps > a.reps) ? b : a));
    points.push({ sessionId: s.session_id, date: s.completed_at, value: metric(best), reps: best.reps, workout: s.template_name });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
