/**
 * Apple Health: which time span a finished workout is saved with (pure, unit-tested). The native
 * side is native-health.ts.
 */

import type { SessionDoc } from "./types";

/** If the workout was left open, it ends this long after the last ticked set. */
export const HEALTH_END_GRACE_MS = 5 * 60_000;
const MIN_MS = 60_000;

/**
 * The start and end to save in Health for a workout finished now, or null when it shouldn't be
 * saved: past workouts logged later (their times aren't real) and workouts with no ticked set.
 */
export function healthWorkoutWindow(doc: Pick<SessionDoc, "started_at" | "is_backdated" | "exercises">, now: Date = new Date()): { start: number; end: number } | null {
  if (doc.is_backdated) return null;
  const start = Date.parse(doc.started_at);
  if (!Number.isFinite(start)) return null;
  const ticked = doc.exercises.flatMap((e) => e.sets).flatMap((s) => (s.completed_at ? [Date.parse(s.completed_at)] : [])).filter(Number.isFinite);
  if (!ticked.length) return null;
  const last = Math.max(...ticked);
  const end = Math.min(now.getTime(), last + HEALTH_END_GRACE_MS);
  return { start, end: Math.max(end, start + MIN_MS) };
}
