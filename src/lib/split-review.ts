import { bestSet, estimate1RM } from "./progress";
import { E1RM_MAX_REPS } from "./records";
import type { PreviousSet, TrackingMode } from "./types";

/**
 * Review of one active period of a split. Purely descriptive: counts what was logged and
 * compares like with like. It does not score adherence and does not claim causes.
 *
 * Sessions belong to a period when they were performed (completed_at) between the period's
 * start and end (open periods run until now) and were logged against this split. Sessions
 * keep the names they had at the time, so later template edits never rewrite this review.
 */

export type ReviewSet = PreviousSet;
export type ReviewExercise = { exerciseId: string; name: string; mode: TrackingMode; skipped: boolean; sets: ReviewSet[] };
export type ReviewSession = { id: string; performedAt: string; workoutName: string; exercises: ReviewExercise[] };

export function inPeriod(performedAt: string, start: string, end: string | null): boolean {
  return performedAt >= start && (end === null || performedAt < end);
}

/** Monday (yyyy-mm-dd) of the week a timestamp falls in, in the viewer's time zone. */
export function weekStart(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const d = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")) - day));
  return d.toISOString().slice(0, 10);
}

const workingSets = (e: ReviewExercise) => e.sets.filter((s) => s.set_type === "working" && s.reps > 0);

/** Completed working sets per calendar week (Mon–Sun), every week of the period included. */
export function weeklyWorkingSets(sessions: ReviewSession[], timeZone: string, start: string, end: string): { week: string; sets: number; sessions: number }[] {
  const weeks = new Map<string, { sets: number; sessions: number }>();
  const first = weekStart(start, timeZone);
  const last = weekStart(end, timeZone);
  for (let d = new Date(first + "T00:00:00Z"); d.toISOString().slice(0, 10) <= last; d.setUTCDate(d.getUTCDate() + 7)) {
    weeks.set(d.toISOString().slice(0, 10), { sets: 0, sessions: 0 });
  }
  for (const s of sessions) {
    const key = weekStart(s.performedAt, timeZone);
    const w = weeks.get(key) ?? { sets: 0, sessions: 0 };
    w.sessions += 1;
    w.sets += s.exercises.reduce((n, e) => n + workingSets(e).length, 0);
    weeks.set(key, w);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }));
}

/** How many times each workout was done in the period, most frequent first. */
export function workoutBreakdown(sessions: ReviewSession[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.workoutName, (counts.get(s.workoutName) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type ExerciseChange = {
  exerciseId: string;
  name: string;
  mode: TrackingMode;
  sessions: number;
  first: { date: string; set: PreviousSet };
  latest: { date: string; set: PreviousSet };
  /** Estimated 1RM of first and latest best sets, only when both are eligible (≤12 reps). */
  e1rm: { first: number; latest: number } | null;
};

/** Exercises performed in at least two sessions, comparing the first and latest best working set. */
export function repeatedExercises(sessions: ReviewSession[]): ExerciseChange[] {
  const byExercise = new Map<string, { name: string; mode: TrackingMode; entries: { date: string; set: PreviousSet }[] }>();
  for (const s of [...sessions].sort((a, b) => a.performedAt.localeCompare(b.performedAt))) {
    const seen = new Set<string>();
    for (const e of s.exercises) {
      if (seen.has(e.exerciseId)) continue;
      const all = s.exercises.filter((x) => x.exerciseId === e.exerciseId).flatMap(workingSets);
      const top = bestSet(all, e.mode);
      if (!top) continue;
      seen.add(e.exerciseId);
      const item = byExercise.get(e.exerciseId) ?? { name: e.name, mode: e.mode, entries: [] };
      item.name = e.name;
      item.entries.push({ date: s.performedAt, set: top });
      byExercise.set(e.exerciseId, item);
    }
  }
  const out: ExerciseChange[] = [];
  for (const [exerciseId, v] of byExercise) {
    if (v.entries.length < 2) continue;
    const first = v.entries[0];
    const latest = v.entries[v.entries.length - 1];
    const eligible = (s: PreviousSet) => v.mode === "weight_reps" && s.reps <= E1RM_MAX_REPS && (s.weight_kg ?? 0) > 0;
    const e1rm =
      eligible(first.set) && eligible(latest.set)
        ? { first: Math.round(estimate1RM(first.set.weight_kg!, first.set.reps) * 10) / 10, latest: Math.round(estimate1RM(latest.set.weight_kg!, latest.set.reps) * 10) / 10 }
        : null;
    out.push({ exerciseId, name: v.name, mode: v.mode, sessions: v.entries.length, first, latest, e1rm });
  }
  return out.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}
