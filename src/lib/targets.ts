import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTarget, type Candidate, type Target } from "./progression";
import type { PreviousSet, TrackingMode } from "./types";
import type { WeightUnit } from "./units";

/** A workout entry that may receive a next-session target. */
export type TargetEntry = {
  key: string;
  exerciseId: string;
  entryId: string | null;
  mode: TrackingMode;
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
};

/** exerciseId guards against showing a target after the entry was substituted. */
export type TargetInfo = { exerciseId: string; target: Target | null; note?: string | null };
export type TargetMap = Record<string, TargetInfo | undefined>;

type CandidateRow = {
  exercise_id: string;
  template_exercise_id: string | null;
  session_id: string;
  completed_at: string;
  template_name: string;
  target_sets: number | null;
  rep_min: number | null;
  rep_max: number | null;
  sets: PreviousSet[] | null;
};

/**
 * Loads progression settings for the entries' workout entries and computes targets from
 * completed history before `before` (or all history). Only entries whose workout entry has
 * targets switched on get a result. Failure (for example before the migration that adds
 * targets has been applied) yields no targets rather than an error: targets are optional.
 */
export async function loadTargets(supabase: SupabaseClient, entries: TargetEntry[], before: string | null, unit: WeightUnit = "kg"): Promise<TargetMap> {
  const entryIds = [...new Set(entries.map((e) => e.entryId).filter((x): x is string => Boolean(x)))];
  if (!entryIds.length) return {};
  const settings = await supabase.from("template_exercises").select("id, progression_enabled, progression_increment_kg").in("id", entryIds);
  if (settings.error) return {};
  const enabled = new Map(
    (settings.data as { id: string; progression_enabled: boolean; progression_increment_kg: number | null }[])
      .filter((s) => s.progression_enabled)
      .map((s) => [s.id, s.progression_increment_kg === null ? null : Number(s.progression_increment_kg)]),
  );
  const wanted = entries.filter((e) => e.entryId && enabled.has(e.entryId));
  if (!wanted.length) return {};
  const res = await supabase.rpc("progression_candidates", { p_exercise_ids: [...new Set(wanted.map((e) => e.exerciseId))], p_before: before, p_limit: 8 });
  if (res.error) return {};
  const byExercise = new Map<string, Candidate[]>();
  for (const r of res.data as CandidateRow[]) {
    const list = byExercise.get(r.exercise_id) ?? [];
    list.push({
      sessionId: r.session_id,
      templateExerciseId: r.template_exercise_id,
      completedAt: r.completed_at,
      workoutName: r.template_name,
      prescription: { targetSets: r.target_sets, repMin: r.rep_min, repMax: r.rep_max },
      sets: (r.sets ?? []).map((s) => ({ ...s, weight_kg: s.weight_kg === null ? null : Number(s.weight_kg) })),
    });
    byExercise.set(r.exercise_id, list);
  }
  const out: TargetMap = {};
  for (const e of wanted) {
    out[e.key] = {
      exerciseId: e.exerciseId,
      ...computeTarget({
      mode: e.mode,
      settings: { enabled: true, incrementKg: enabled.get(e.entryId!) ?? null },
      prescription: { targetSets: e.targetSets, repMin: e.repMin, repMax: e.repMax },
      entryId: e.entryId,
      candidates: byExercise.get(e.exerciseId) ?? [],
      unit,
      }),
    };
  }
  return out;
}
