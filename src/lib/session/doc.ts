import type { Exercise, PreviousMap, SessionDoc, SessionExercise, SessionSet, SetType } from "../types";
import { isValidNumber } from "../validation";
import { matchPrevious, suggestWeight } from "./previous";

export type IdGen = () => string;

const renumber = <T extends { position: number }>(items: T[]): T[] => items.map((item, i) => ({ ...item, position: i }));

function mapExercise(doc: SessionDoc, exerciseEntryId: string, fn: (ex: SessionExercise) => SessionExercise): SessionDoc {
  return { ...doc, exercises: doc.exercises.map((ex) => (ex.id === exerciseEntryId ? fn(ex) : ex)) };
}

function plannedSet(ex: SessionExercise, sets: SessionSet[], setType: SetType, previous: PreviousMap, id: IdGen): SessionSet {
  const prev = previous[ex.exercise_id]?.sets;
  const rows = [...sets, { set_type: setType }];
  const matched = matchPrevious(rows, prev)[rows.length - 1];
  // Without a matching set from last time, continue from the set above it in this session.
  const above = sets.at(-1)?.weight_kg;
  const weight =
    ex.tracking_mode === "bodyweight_reps"
      ? null
      : matched
        ? matched.weight_kg
        : isValidNumber(above ?? null)
          ? (above as number)
          : suggestWeight(ex.tracking_mode, null, prev, setType);
  return {
    id: id(),
    position: sets.length,
    set_type: setType,
    weight_kg: weight,
    reps: null,
    completed_at: null,
  };
}

/** Creates the planned (unconfirmed) working-set rows for exercises that have none yet. */
export function ensurePlannedSets(doc: SessionDoc, previous: PreviousMap, id: IdGen): SessionDoc {
  let changed = false;
  const exercises = doc.exercises.map((ex) => {
    if (ex.sets.length > 0 || ex.skipped) return ex;
    changed = true;
    const sets: SessionSet[] = [];
    const count = ex.target_sets ?? previous[ex.exercise_id]?.sets.filter((s) => s.set_type === "working").length ?? 1;
    for (let i = 0; i < Math.max(1, count); i++) sets.push(plannedSet(ex, sets, "working", previous, id));
    return { ...ex, sets };
  });
  return changed ? { ...doc, exercises } : doc;
}

/**
 * Edits a set. A new weight also carries forward to the later, unconfirmed sets of the same
 * type that were following it (empty, or still showing the old weight). Sets given their own
 * weight, and confirmed sets, are left alone.
 */
export function updateSet(doc: SessionDoc, exId: string, setId: string, patch: Partial<Pick<SessionSet, "weight_kg" | "reps">>): SessionDoc {
  return mapExercise(doc, exId, (ex) => {
    const index = ex.sets.findIndex((s) => s.id === setId);
    if (index < 0) return ex;
    const target = ex.sets[index];
    const sets = ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
    if ("weight_kg" in patch && patch.weight_kg !== target.weight_kg) {
      let following = target.weight_kg;
      for (let i = index + 1; i < sets.length; i++) {
        const s = sets[i];
        if (s.set_type !== target.set_type) continue;
        if (s.completed_at) break;
        if (s.weight_kg !== null && s.weight_kg !== following) break;
        following = s.weight_kg ?? following;
        sets[i] = { ...s, weight_kg: patch.weight_kg ?? null };
      }
    }
    return { ...ex, sets };
  });
}

/**
 * "Use target": sets the weight of this exercise's unconfirmed working sets to a suggested
 * target weight. Reps are left empty and nothing is confirmed, so a target can never become
 * a recorded result without the user entering reps and confirming each set.
 */
export function applyTargetWeight(doc: SessionDoc, exId: string, weightKg: number): SessionDoc {
  return mapExercise(doc, exId, (ex) => ({
    ...ex,
    sets: ex.sets.map((s) => (s.set_type === "working" && !s.completed_at ? { ...s, weight_kg: weightKg } : s)),
  }));
}

export type CompleteError = "reps_required" | "weight_required" | "invalid";

/** Checks whether a set can be confirmed, and the weight that would be recorded. */
export function validateCompletion(ex: SessionExercise, set: SessionSet): { weight: number | null } | { error: CompleteError } {
  if (!isValidNumber(set.reps) || set.reps < 1) return { error: "reps_required" };
  if (ex.tracking_mode === "bodyweight_reps") return { weight: null };
  if (ex.tracking_mode === "added_weight_reps") {
    const weight = set.weight_kg ?? 0;
    return isValidNumber(weight) ? { weight } : { error: "invalid" };
  }
  return isValidNumber(set.weight_kg) ? { weight: set.weight_kg } : { error: "weight_required" };
}

/** Explicitly confirms a set. Prefilled values only count after this succeeds. */
export function completeSet(doc: SessionDoc, exId: string, setId: string, now: Date): { doc: SessionDoc } | { error: CompleteError } {
  const ex = doc.exercises.find((e) => e.id === exId);
  const set = ex?.sets.find((s) => s.id === setId);
  if (!ex || !set) return { error: "invalid" };
  const check = validateCompletion(ex, set);
  if ("error" in check) return check;
  return {
    doc: mapExercise(doc, exId, (e) => ({
      ...e,
      skipped: false,
      sets: e.sets.map((s) => (s.id === setId ? { ...s, weight_kg: check.weight, completed_at: now.toISOString() } : s)),
    })),
  };
}

export function uncompleteSet(doc: SessionDoc, exId: string, setId: string): SessionDoc {
  return mapExercise(doc, exId, (ex) => ({
    ...ex,
    sets: ex.sets.map((s) => (s.id === setId ? { ...s, completed_at: null } : s)),
  }));
}

export function addSet(doc: SessionDoc, exId: string, setType: SetType, previous: PreviousMap, id: IdGen): SessionDoc {
  return mapExercise(doc, exId, (ex) => {
    if (setType === "warmup") {
      // Warm-ups go before the working sets.
      const warmups = ex.sets.filter((s) => s.set_type === "warmup");
      const next = plannedSet(ex, warmups, "warmup", previous, id);
      const insertAt = ex.sets.findIndex((s) => s.set_type !== "warmup");
      const sets = [...ex.sets];
      sets.splice(insertAt === -1 ? sets.length : insertAt, 0, next);
      return { ...ex, skipped: false, sets: renumber(sets) };
    }
    const working = ex.sets.filter((s) => s.set_type === "working");
    const next = plannedSet(ex, working, "working", previous, id);
    return { ...ex, skipped: false, sets: renumber([...ex.sets, next]) };
  });
}

export function removeSet(doc: SessionDoc, exId: string, setId: string): SessionDoc {
  return mapExercise(doc, exId, (ex) => ({ ...ex, sets: renumber(ex.sets.filter((s) => s.id !== setId)) }));
}

export function setSetType(doc: SessionDoc, exId: string, setId: string, setType: SetType): SessionDoc {
  return mapExercise(doc, exId, (ex) => {
    const sets = ex.sets.map((s) => (s.id === setId ? { ...s, set_type: setType } : s));
    // Keep warm-ups first so numbering stays readable.
    const ordered = [...sets.filter((s) => s.set_type === "warmup"), ...sets.filter((s) => s.set_type === "working")];
    return { ...ex, sets: renumber(ordered) };
  });
}

export function setSkipped(doc: SessionDoc, exId: string, skipped: boolean): SessionDoc {
  return mapExercise(doc, exId, (ex) => ({
    ...ex,
    skipped,
    // Skipping drops unconfirmed rows; confirmed sets are kept (they were performed).
    sets: skipped ? renumber(ex.sets.filter((s) => s.completed_at)) : ex.sets,
  }));
}

export function setExerciseNotes(doc: SessionDoc, exId: string, notes: string): SessionDoc {
  return mapExercise(doc, exId, (ex) => ({ ...ex, notes }));
}

function entryFor(exercise: Exercise, id: IdGen, base?: Partial<SessionExercise>): SessionExercise {
  return {
    id: id(),
    exercise_id: exercise.id,
    template_exercise_id: null,
    position: 0,
    exercise_name: exercise.variant ? `${exercise.name} · ${exercise.variant}` : exercise.name,
    tracking_mode: exercise.tracking_mode,
    target_sets: null,
    rep_min: null,
    rep_max: null,
    rest_seconds: null,
    template_notes: null,
    notes: null,
    skipped: false,
    sets: [],
    ...base,
  };
}

/** Adds an exercise to this session only (the template is untouched). */
export function addExercise(doc: SessionDoc, exercise: Exercise, previous: PreviousMap, id: IdGen): SessionDoc {
  const entry = entryFor(exercise, id, { target_sets: 2 });
  const next = { ...doc, exercises: renumber([...doc.exercises, entry]) };
  return ensurePlannedSets(next, previous, id);
}

export type SubstituteError = "has_completed_sets";

/** Swaps the exercise for this session only, keeping the prescribed targets. */
export function substituteExercise(
  doc: SessionDoc,
  exId: string,
  exercise: Exercise,
  previous: PreviousMap,
  id: IdGen,
): { doc: SessionDoc } | { error: SubstituteError } {
  const current = doc.exercises.find((e) => e.id === exId);
  if (!current) return { doc };
  // Confirmed sets belong to the exercise that was actually performed.
  if (current.sets.some((s) => s.completed_at)) return { error: "has_completed_sets" };
  const replaced = doc.exercises.map((ex) =>
    ex.id === exId
      ? entryFor(exercise, () => ex.id, {
          position: ex.position,
          target_sets: ex.target_sets,
          rep_min: ex.rep_min,
          rep_max: ex.rep_max,
          rest_seconds: ex.rest_seconds,
          template_notes: ex.template_notes,
          notes: ex.notes,
          template_exercise_id: ex.template_exercise_id,
        })
      : ex,
  );
  return { doc: ensurePlannedSets({ ...doc, exercises: replaced }, previous, id) };
}

export function moveExercise(doc: SessionDoc, exId: string, direction: -1 | 1): SessionDoc {
  const i = doc.exercises.findIndex((e) => e.id === exId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= doc.exercises.length) return doc;
  const exercises = [...doc.exercises];
  [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
  return { ...doc, exercises: renumber(exercises) };
}

export function removeExercise(doc: SessionDoc, exId: string): SessionDoc {
  return { ...doc, exercises: renumber(doc.exercises.filter((e) => e.id !== exId)) };
}

export type SessionSummary = {
  completedSets: number;
  plannedSets: number;
  exercises: { id: string; name: string; completed: number; unconfirmed: number; skipped: boolean }[];
};

export function summarize(doc: SessionDoc): SessionSummary {
  const exercises = doc.exercises.map((ex) => ({
    id: ex.id,
    name: ex.exercise_name,
    completed: ex.sets.filter((s) => s.completed_at).length,
    unconfirmed: ex.sets.filter((s) => !s.completed_at).length,
    skipped: ex.skipped,
  }));
  return {
    completedSets: exercises.reduce((n, e) => n + e.completed, 0),
    plannedSets: doc.exercises.reduce((n, ex) => n + (ex.skipped ? ex.sets.filter((s) => s.completed_at).length : ex.sets.length), 0),
    exercises,
  };
}

/** The document sent to sync_session. */
export function toPayload(doc: SessionDoc) {
  return {
    notes: doc.notes,
    exercises: doc.exercises.map((ex, i) => ({
      id: ex.id,
      exercise_id: ex.exercise_id,
      template_exercise_id: ex.template_exercise_id,
      position: i,
      exercise_name: ex.exercise_name,
      target_sets: ex.target_sets,
      rep_min: ex.rep_min,
      rep_max: ex.rep_max,
      rest_seconds: ex.rest_seconds,
      template_notes: ex.template_notes,
      notes: ex.notes,
      skipped: ex.skipped,
      sets: ex.sets.map((s, j) => ({
        id: s.id,
        position: j,
        set_type: s.set_type,
        weight_kg: isValidNumber(s.weight_kg) ? s.weight_kg : null,
        reps: isValidNumber(s.reps) ? s.reps : null,
        completed_at: s.completed_at,
      })),
    })),
  };
}

export type SyncPayload = ReturnType<typeof toPayload>;
