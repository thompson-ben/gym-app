import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SessionView, type SessionInsights } from "@/components/SessionView";
import { meaningfulDurationMinutes } from "@/lib/format";
import type { HistorySession } from "@/lib/progress";
import { compareWithPrevious, recordsFor } from "@/lib/records";
import { requireUser, viewerTimeZone, viewerUnit } from "@/lib/supabase/server";
import { loadTargets } from "@/lib/targets";
import type { SessionDoc } from "@/lib/types";
import type { WeightUnit } from "@/lib/units";

export const metadata: Metadata = { title: "Workout" };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ finished?: string }> }) {
  const { sessionId } = await params;
  const { finished } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("session_document", { p_session_id: sessionId });
  if (error) throw error;
  if (!data) notFound();
  const doc = data as SessionDoc;
  if (doc.status === "in_progress") redirect(`/workout/${sessionId}`);
  if (doc.status === "discarded") notFound();

  const [timeZone, unit] = await Promise.all([viewerTimeZone(), viewerUnit()]);
  return <SessionView doc={doc} timeZone={timeZone} unit={unit} justFinished={finished === "1"} insights={await insightsFor(supabase, doc, unit)} />;
}

/**
 * Records, like-for-like changes and next targets, all derived from current history so they
 * stay correct after any workout is edited, re-dated or deleted.
 */
async function insightsFor(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], doc: SessionDoc, unit: WeightUnit): Promise<SessionInsights> {
  const performed = [...new Map(doc.exercises.filter((e) => e.sets.some((s) => s.set_type === "working")).map((e) => [e.exercise_id, e])).values()];
  const [histories, others, targets] = await Promise.all([
    Promise.all(performed.map((e) => supabase.rpc("exercise_history", { p_exercise_id: e.exercise_id }))),
    supabase.from("workout_sessions").select("id", { count: "exact", head: true }).eq("status", "completed").neq("id", doc.id),
    loadTargets(
      supabase,
      doc.exercises.map((e) => ({ key: e.id, exerciseId: e.exercise_id, entryId: e.template_exercise_id, mode: e.tracking_mode, targetSets: e.target_sets, repMin: e.rep_min, repMax: e.rep_max })),
      null,
      unit,
    ),
  ]);
  const byExercise: SessionInsights["byExercise"] = {};
  performed.forEach((e, i) => {
    const res = histories[i];
    if (res.error) return;
    const history = (res.data as HistorySession[]).map((h) => ({
      sessionId: h.session_id,
      performedAt: h.completed_at,
      sets: h.sets.map((s) => ({ ...s, weight_kg: s.weight_kg === null ? null : Number(s.weight_kg) })),
    }));
    const current = history.find((h) => h.sessionId === doc.id);
    if (!current) return;
    const previous = history.filter((h) => h.performedAt < current.performedAt).sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0];
    byExercise[e.exercise_id] = {
      records: recordsFor(e.tracking_mode, current, history, unit),
      change: compareWithPrevious(e.tracking_mode, current.sets, previous?.sets, unit),
    };
  });
  // Next targets are shown only where this workout is the performance they build on.
  const next = Object.fromEntries(Object.entries(targets).filter(([, t]) => t?.target?.basis.sessionId === doc.id));
  return {
    byExercise,
    nextTargets: next,
    firstWorkout: !others.error && (others.count ?? 0) === 0,
    durationMinutes: doc.completed_at ? meaningfulDurationMinutes(doc.started_at, doc.completed_at, doc.is_backdated) : null,
  };
}
