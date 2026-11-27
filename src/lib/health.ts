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

/**
 * Active calories (above resting) burned lifting weights: about 3.5 extra METs on top of rest,
 * i.e. 3.5 kcal per kg of body weight per hour. That's a typical full session of sets plus rest
 * (a 55-minute session at 80 kg ≈ 257 kcal). An estimate, labelled as one in the app.
 */
export const STRENGTH_ACTIVE_MET = 3.5;

/** Estimated active kcal for a workout, or 0 without a sensible body weight. */
export function estimateActiveKcal(window_: { start: number; end: number }, bodyKg: number | null | undefined): number {
  if (!bodyKg || !Number.isFinite(bodyKg) || bodyKg < 30 || bodyKg > 300) return 0;
  const hours = Math.max(0, window_.end - window_.start) / 3_600_000;
  return Math.round(STRENGTH_ACTIVE_MET * bodyKg * Math.min(hours, 4));
}
