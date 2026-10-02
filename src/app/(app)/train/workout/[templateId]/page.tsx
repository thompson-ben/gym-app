import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogPastWorkoutButton, StartWorkoutButton } from "@/components/StartWorkoutButton";
import { buttonClass } from "@/components/styles";
import { PageHeader } from "@/components/ui";
import { exerciseLabel } from "@/lib/exercises";
import { formatSet, formatShortDate, formatTargetLong } from "@/lib/format";
import { formatTargetSets } from "@/lib/progression";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";
import { loadTargets } from "@/lib/targets";
import type { PreviousPerformance, TrackingMode } from "@/lib/types";

export const metadata: Metadata = { title: "Workout" };

type EntryRow = {
  id: string;
  position: number;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  notes: string | null;
  exercise: { id: string; name: string; variant: string | null; tracking_mode: TrackingMode } | null;
};

/** Read-only look at a workout before starting it: order, targets, last performance, notes. */
export default async function WorkoutPreviewPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) notFound();
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();

  const [tpl, entries, open, last] = await Promise.all([
    supabase.from("workout_templates").select("id, name, split_id, splits(id, name)").eq("id", templateId).maybeSingle(),
    supabase
      .from("template_exercises")
      .select("id, position, target_sets, rep_min, rep_max, rest_seconds, notes, exercise:exercises(id, name, variant, tracking_mode)")
      .eq("template_id", templateId)
      .order("position")
      .order("created_at"),
    supabase.from("workout_sessions").select("id, template_name").eq("status", "in_progress").maybeSingle(),
    supabase.from("workout_sessions").select("id, completed_at").eq("status", "completed").eq("template_id", templateId).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (tpl.error) throw tpl.error;
  if (!tpl.data) notFound();
  if (entries.error) throw entries.error;
  const split = tpl.data.splits as unknown as { id: string; name: string } | null;
  const rows = (entries.data as unknown as EntryRow[]).filter((r) => r.exercise);
  const exerciseIds = [...new Set(rows.map((r) => r.exercise!.id))];

  const [prev, targets] = await Promise.all([
    exerciseIds.length ? supabase.rpc("previous_performance", { p_exercise_ids: exerciseIds, p_before: null }) : Promise.resolve({ data: [], error: null }),
    loadTargets(
      supabase,
      rows.map((r) => ({ key: r.id, exerciseId: r.exercise!.id, entryId: r.id, mode: r.exercise!.tracking_mode, targetSets: r.target_sets, repMin: r.rep_min, repMax: r.rep_max })),
      null,
    ),
  ]);
  if (prev.error) throw prev.error;
  const previous = new Map((prev.data as PreviousPerformance[]).map((p) => [p.exercise_id, p]));
  const workingSets = rows.reduce((n, r) => n + r.target_sets, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/train", label: "Train" }}
        eyebrow={split?.name}
        title={<span className="break-words">{tpl.data.name}</span>}
        action={split ? <Link href={`/splits/${split.id}/workouts/${templateId}`} className={buttonClass("quiet", "sm")}>Edit</Link> : null}
      />
      <p className="-mt-3 mb-5 text-[15px] text-muted">
        {rows.length} {rows.length === 1 ? "exercise" : "exercises"} · {workingSets} working {workingSets === 1 ? "set" : "sets"} ·{" "}
        {last.data?.completed_at ? (
          <Link href={`/sessions/${last.data.id}`} className="underline-offset-4 hover:underline">last performed {formatShortDate(last.data.completed_at, tz)}</Link>
        ) : (
          "not performed yet"
        )}
      </p>

      {rows.length ? (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const e = r.exercise!;
            const p = previous.get(e.id);
            const working = p?.sets.filter((s) => s.set_type === "working") ?? [];
            const t = targets[r.id];
            return (
              <li key={r.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="tabular w-5 shrink-0 text-sm text-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/progress/${e.id}`} className="font-medium break-words underline-offset-4 hover:underline">{exerciseLabel(e)}</Link>
                    <p className="text-sm text-muted">{formatTargetLong(r.target_sets, r.rep_min, r.rep_max) || "No sets or reps set"}</p>
                    <p className="mt-1 text-sm">
                      <span className="text-faint">Last: </span>
                      {working.length ? (
                        <span className="tabular">
                          {working.map((s) => formatSet(e.tracking_mode, s.weight_kg, s.reps)).join(", ")}
                          <span className="text-faint"> · {formatShortDate(p!.completed_at, tz)}</span>
                        </span>
                      ) : (
                        <span className="text-faint">no history yet</span>
                      )}
                    </p>
                    {t?.target ? (
                      <p className="mt-1 text-sm">
                        <span className="rounded-md border border-accent-text/40 px-1.5 py-0.5 text-xs font-medium text-accent-text">Target</span>{" "}
                        <span className="tabular">{formatTargetSets(t.target)}</span>
                      </p>
                    ) : null}
                    {r.notes ? <p className="mt-1 text-sm whitespace-pre-line text-muted">{r.notes}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">No exercises yet.</p>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {open.data ? (
          <p className="text-sm text-muted">
            <Link href={`/workout/${open.data.id}`} className="text-accent-text underline-offset-4 hover:underline">Resume {open.data.template_name}</Link> before starting another workout.
          </p>
        ) : (
          <>
            <StartWorkoutButton templateId={templateId} size="lg" label="Start workout" className="flex-1" disabled={!rows.length} />
            <LogPastWorkoutButton workouts={[{ id: templateId, name: tpl.data.name }]} disabled={!rows.length} variant="secondary" size="lg" />
          </>
        )}
      </div>
    </>
  );
}
