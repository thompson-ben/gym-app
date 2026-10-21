export type TrackingMode = "weight_reps" | "bodyweight_reps" | "added_weight_reps" | "duration" | "added_weight_duration";
export type SetType = "working" | "warmup";

export type Exercise = {
  id: string;
  owner_id: string | null;
  slug: string | null;
  name: string;
  variant: string | null;
  primary_muscle: string;
  equipment: string;
  tracking_mode: TrackingMode;
  aliases: string[];
  origin_exercise_id: string | null;
  archived_at: string | null;
};

export type SessionSet = {
  id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  completed_at: string | null;
};

export type SessionExercise = {
  id: string;
  exercise_id: string;
  template_exercise_id: string | null;
  position: number;
  exercise_name: string;
  tracking_mode: TrackingMode;
  target_sets: number | null;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  template_notes: string | null;
  notes: string | null;
  skipped: boolean;
  /** Done back to back with the next exercise (a superset); migration 29. */
  superset_next?: boolean;
  sets: SessionSet[];
};

export type SessionStatus = "in_progress" | "completed" | "discarded";

export type SessionDoc = {
  id: string;
  status: SessionStatus;
  revision: number;
  split_id: string | null;
  template_id: string | null;
  split_name: string | null;
  template_name: string;
  started_at: string;
  completed_at: string | null;
  /** Logged for an earlier date: started_at is when it was performed. */
  is_backdated?: boolean;
  notes: string | null;
  exercises: SessionExercise[];
};

export type PreviousSet = { set_type: SetType; weight_kg: number | null; reps: number };

/** The most recent completed session containing an exercise (never mixed across days). */
export type PreviousPerformance = {
  exercise_id: string;
  session_id: string;
  completed_at: string;
  template_name: string;
  split_name: string | null;
  sets: PreviousSet[];
};

export type PreviousMap = Record<string, PreviousPerformance | undefined>;

export const MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings",
  "glutes", "adductors", "calves", "core", "full_body",
] as const;

export const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "smith_machine", "bodyweight", "kettlebell",
  "ez_bar", "trap_bar", "band", "other",
] as const;

export const TRACKING_MODES: { value: TrackingMode; label: string; hint: string }[] = [
  { value: "weight_reps", label: "Weight × reps", hint: "Load lifted and reps" },
  { value: "added_weight_reps", label: "Added weight × reps", hint: "Bodyweight plus extra load, e.g. weighted dips. 0 = bodyweight only" },
  { value: "bodyweight_reps", label: "Reps only", hint: "Bodyweight movements without added load" },
  { value: "duration", label: "Time", hint: "Holds in seconds, e.g. front lever, L-sit, plank" },
  { value: "added_weight_duration", label: "Added weight × time", hint: "Holds with extra load, e.g. weighted dead hang. 0 = bodyweight only" },
];

/**
 * Timed exercises (migration 20) store the seconds held in the reps fields: a set's `reps`
 * is its seconds, and a rep range is a range of seconds.
 */
export const isTimed = (mode: TrackingMode) => mode === "duration" || mode === "added_weight_duration";
/** Load is extra weight on top of bodyweight ("+10 kg"; 0 = bodyweight). */
export const isAddedWeight = (mode: TrackingMode) => mode === "added_weight_reps" || mode === "added_weight_duration";
/** No load is recorded at all. */
export const isUnloaded = (mode: TrackingMode) => mode === "bodyweight_reps" || mode === "duration";
