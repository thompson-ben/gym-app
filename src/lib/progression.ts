import type { WeightUnit } from "./units";
import { formatWeight, formatWeightValue } from "./units";
import type { PreviousSet, TrackingMode } from "./types";

/**
 * Optional next-session targets using simple double progression.
 *
 * A target is a suggestion shown next to the logger. It is never stored as a set, never
 * prefilled into reps, and never counts as performed. The rules are conservative: when the
 * last performance cannot be compared like for like, no target is offered.
 *
 * Eligibility (all required):
 * - The workout entry has targets switched on and a user-chosen weight increment.
 * - The exercise is tracked as weight × reps. Bodyweight and added-weight exercises get no
 *   automatic progression: total load depends on bodyweight, which is not recorded.
 * - The entry has a rep range (min and max) and a working-set count.
 *
 * Basis (the performance a target is computed from):
 * - Same exercise identity (exercise id; gym-specific variants are separate exercises).
 * - Same prescription as now: identical rep range and working-set count in the session
 *   snapshot. A performance under a different prescription is not comparable.
 * - The same workout entry is preferred; otherwise the most recent comparable performance in
 *   another workout is used and named.
 * - Only completed working sets count. Warm-ups never do.
 *
 * Rule, using the first N completed working sets (N = working-set count; extra sets ignored):
 * - Fewer than N completed working sets: no target (an incomplete session never progresses).
 * - Sets at different weights: no target (we do not guess which weight to build on).
 * - Every set reached the top of the range: add the increment, aim for the bottom of range.
 * - Otherwise: keep the weight and aim for one more rep per set, capped at the top of range.
 * - The weight is never lowered automatically.
 */

export type ProgressionSettings = {
  enabled: boolean;
  incrementKg: number | null;
};

export type Prescription = { targetSets: number | null; repMin: number | null; repMax: number | null };

export type Candidate = {
  sessionId: string;
  templateExerciseId: string | null;
  completedAt: string;
  workoutName: string;
  prescription: Prescription;
  sets: PreviousSet[];
};

export type Target = {
  weightKg: number;
  /** Rep goal per working set, in order. */
  reps: number[];
  kind: "increase" | "repeat";
  reason: string;
  basis: { sessionId: string; completedAt: string; workoutName: string; sameEntry: boolean };
};


export type TargetResult = { target: Target } | { target: null; note: string | null };

const samePrescription = (a: Prescription, b: Prescription) =>
  a.targetSets === b.targetSets && a.repMin === b.repMin && a.repMax === b.repMax;

/** Picks the comparable basis: the same entry if possible, else the most recent comparable one. */
export function pickBasis(entryId: string | null, prescription: Prescription, candidates: Candidate[]): Candidate | null {
  const comparable = candidates
    .filter((c) => samePrescription(c.prescription, prescription))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return (entryId ? comparable.find((c) => c.templateExerciseId === entryId) : undefined) ?? comparable[0] ?? null;
}

export function computeTarget(input: {
  mode: TrackingMode;
  settings: ProgressionSettings;
  prescription: Prescription;
  entryId: string | null;
  candidates: Candidate[];
  /** Unit for the explanation text only; weights are always kg. */
  unit?: WeightUnit;
}): TargetResult {
  const { mode, settings, prescription } = input;
  if (!settings.enabled) return { target: null, note: null };
  if (mode !== "weight_reps") return { target: null, note: "Targets are only suggested for weight × reps exercises." };
  const { targetSets, repMin, repMax } = prescription;
  if (!settings.incrementKg || settings.incrementKg <= 0) return { target: null, note: "Set a weight increment to get targets." };
  if (!targetSets || !repMin || !repMax) return { target: null, note: "Set a rep range and working sets to get targets." };

  const basis = pickBasis(input.entryId, prescription, input.candidates);
  if (!basis) return { target: null, note: "No comparable session yet. Log this exercise once with the current sets and rep range." };

  const working = basis.sets.filter((s) => s.set_type === "working").slice(0, targetSets);
  if (working.length < targetSets) {
    return { target: null, note: `Last time ${working.length} of ${targetSets} working sets were completed, so no target this time.` };
  }
  const weights = new Set(working.map((s) => s.weight_kg));
  const weight = working[0].weight_kg;
  if (weights.size !== 1 || weight === null || weight <= 0) {
    return { target: null, note: "Last time’s working sets used different weights, so no target this time." };
  }

  const sameEntry = Boolean(input.entryId) && basis.templateExerciseId === input.entryId;
  const meta = { sessionId: basis.sessionId, completedAt: basis.completedAt, workoutName: basis.workoutName, sameEntry };

  if (working.every((s) => s.reps >= repMax)) {
    return {
      target: {
        weightKg: roundKg(weight + settings.incrementKg),
        reps: working.map(() => repMin),
        kind: "increase",
        reason: "You reached the top of your rep range on all working sets.",
        basis: meta,
      },
    };
  }
  return {
    target: {
      weightKg: weight,
      reps: working.map((s) => Math.min(repMax, Math.max(repMin, s.reps + 1))),
      kind: "repeat",
      reason: `Stay at ${formatWeight(weight, input.unit ?? "kg")} and add reps until every set reaches ${repMax}.`,
      basis: meta,
    },
  };
}

/** Stored precision (4 dp), so a target built from pound values shows back as whole pounds. */
const roundKg = (n: number) => Math.round(n * 10_000) / 10_000;

/** "32.5 kg × 8, 8, 8" or "32.5 kg × 8" when all goals are equal (or lb). */
export function formatTargetSets(t: Pick<Target, "weightKg" | "reps">, unit: WeightUnit = "kg"): string {
  const allSame = t.reps.every((r) => r === t.reps[0]);
  return `${formatWeightValue(t.weightKg, unit)} ${unit} × ${allSame ? t.reps[0] : t.reps.join(", ")}`;
}

/**
 * Factual nudge without any settings: last time, every one of the first N completed working
 * sets reached the top of the current rep range. Only for loaded exercises (weight × reps or
 * added weight). Returns the rep count reached, or null.
 */
export function topOfRangeLastTime(mode: TrackingMode, prescription: Prescription, previousSets: PreviousSet[] | undefined): number | null {
  const { targetSets, repMax } = prescription;
  if (mode === "bodyweight_reps" || !targetSets || !repMax || !previousSets) return null;
  const working = previousSets.filter((s) => s.set_type === "working").slice(0, targetSets);
  if (working.length < targetSets) return null;
  return working.every((s) => s.reps >= repMax) ? repMax : null;
}

type DoneSet = { set_type: "working" | "warmup"; weight_kg: number | null; reps: number | null; completed_at: string | null };

/**
 * Whether this session's completed working sets meet or beat a target on every set: at
 * least as many completed working sets as the target has, each at the target weight or
 * heavier and with at least the target reps. Warm-ups and unconfirmed sets never count.
 */
export function targetMet(target: Pick<Target, "weightKg" | "reps">, sets: DoneSet[]): boolean {
  const done = sets.filter((s) => s.set_type === "working" && s.completed_at && s.reps !== null);
  if (done.length < target.reps.length) return false;
  return target.reps.every((reps, i) => (done[i].weight_kg ?? 0) >= target.weightKg && (done[i].reps ?? 0) >= reps);
}

/** Without targets: every planned working set done this session reached the top of the range. */
export function topOfRangeNow(mode: TrackingMode, prescription: Prescription, sets: DoneSet[]): boolean {
  const { targetSets, repMax } = prescription;
  if (mode === "bodyweight_reps" || !targetSets || !repMax) return false;
  const done = sets.filter((s) => s.set_type === "working" && s.completed_at && s.reps !== null);
  return done.length >= targetSets && done.slice(0, targetSets).every((s) => (s.reps ?? 0) >= repMax);
}
