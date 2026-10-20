/**
 * The "Try a workout" demo (/try): the first workout of a starter split with example numbers
 * from "last time", logged entirely on the phone with no account. Pure; unit-tested.
 *
 * The example previous sets are clearly labelled as examples in the UI. Nothing from the demo
 * becomes part of anyone's history: after sign-up the same starter split is offered, ready for a
 * first real session.
 */
import { ensurePlannedSets } from "./session/doc";
import { STARTERS } from "./starters";
import type { PreviousMap, SessionDoc } from "./types";

/** The starter split the demo uses and offers after sign-up. */
export const DEMO_STARTER = "full-body";
/** Set when someone taps create account from the demo (read at sign-up and on Train). */
export const DEMO_COOKIE = "nl_demo";
export const DEMO_STORAGE_KEY = "notchlift-demo-v2";

const NAMES: Record<string, string> = { "back-squat": "Back squat", "barbell-bench-press": "Barbell bench press", "seated-cable-row": "Seated cable row" };
/** Example "last time" sets. Bench reached the top of its range, so the demo shows the go-heavier nudge. */
const EXAMPLE: Record<string, { weight: number; reps: number[] }> = {
  "back-squat": { weight: 80, reps: [8, 8, 7] },
  "barbell-bench-press": { weight: 60, reps: [10, 10, 10] },
  "seated-cable-row": { weight: 50, reps: [12, 11, 10] },
};

export function demoStarter() {
  return STARTERS.find((s) => s.key === DEMO_STARTER)!;
}

/** A fresh demo workout: three exercises from Full Body A, sets planned from the example numbers. */
export function buildDemo(now: Date, id: () => string): { doc: SessionDoc; previous: PreviousMap } {
  const workout = demoStarter().workouts[0];
  const picked = workout.exercises.filter((e) => e.slug in NAMES);
  const lastTime = new Date(now.getTime() - 4 * 86_400_000).toISOString();
  const previous: PreviousMap = Object.fromEntries(
    picked.map((e) => [
      `demo-${e.slug}`,
      {
        exercise_id: `demo-${e.slug}`,
        session_id: "demo-last-time",
        completed_at: lastTime,
        template_name: workout.name,
        split_name: demoStarter().name,
        sets: EXAMPLE[e.slug].reps.map((reps) => ({ set_type: "working" as const, weight_kg: EXAMPLE[e.slug].weight, reps })),
      },
    ]),
  );
  const doc: SessionDoc = {
    id: "demo",
    status: "in_progress",
    revision: 0,
    split_id: null,
    template_id: null,
    split_name: demoStarter().name,
    template_name: workout.name,
    started_at: now.toISOString(),
    completed_at: null,
    notes: null,
    exercises: picked.map((e, i) => ({
      id: `demo-entry-${i}`,
      exercise_id: `demo-${e.slug}`,
      template_exercise_id: null,
      position: i,
      exercise_name: NAMES[e.slug],
      tracking_mode: "weight_reps",
      target_sets: e.sets,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      rest_seconds: e.rest_seconds,
      template_notes: null,
      notes: null,
      skipped: false,
      sets: [],
    })),
  };
  // Reps start at last time's numbers, so one tap on ✓ logs a set (an empty box looked filled
  // in, and ticking it only asked for reps). Weights and reps can still be changed first.
  const planned = ensurePlannedSets(doc, previous, id);
  return {
    doc: {
      ...planned,
      exercises: planned.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s, i) => ({ ...s, reps: previous[ex.exercise_id]?.sets[i]?.reps ?? s.reps })),
      })),
    },
    previous,
  };
}

/** A saved demo from this browser, or null when it's missing or not a demo document. */
export function parseSavedDemo(raw: string | null): SessionDoc | null {
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw) as SessionDoc;
    return doc?.id === "demo" && Array.isArray(doc.exercises) && doc.exercises.every((e) => Array.isArray(e.sets)) ? doc : null;
  } catch {
    return null;
  }
}

/** Whether a signed-in person should be offered the demo's split: they came from the demo and have no splits yet. */
export function cameFromDemo(metadata: Record<string, unknown> | null | undefined, cookie: string | undefined): boolean {
  return metadata?.via === "demo" || cookie === DEMO_STARTER;
}

/** Browser only: forget the demo once its split has been created. */
export function clearDemoCookie() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
