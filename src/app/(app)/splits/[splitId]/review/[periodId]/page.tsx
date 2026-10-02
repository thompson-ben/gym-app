import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronRight } from "@/components/icons";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatElapsed, formatKg, formatSet, formatShortDate } from "@/lib/format";
import { repeatedExercises, weeklyWorkingSets, workoutBreakdown, type ReviewSession } from "@/lib/split-review";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";
import type { SetType, TrackingMode } from "@/lib/types";

export const metadata: Metadata = { title: "Split review" };

type Row = {
  id: string;
  template_name: string;
  completed_at: string;
  session_exercises: {
    exercise_id: string;
    exercise_name: string;
    skipped: boolean;
    position: number;
    exercises: { tracking_mode: TrackingMode } | null;
    session_sets: { set_type: SetType; weight_kg: number | null; reps: number | null; completed_at: string | null; position: number }[];
  }[];
};

/** What was logged during one active period of a split. Descriptive only. */
export default async function SplitReviewPage({ params }: { params: Promise<{ splitId: string; periodId: string }> }) {
  const { splitId, periodId } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(splitId) || !uuid.test(periodId)) notFound();
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();

  const { data: period, error } = await supabase
    .from("split_active_periods")
    .select("id, started_at, ended_at, splits(id, name)")
    .eq("id", periodId)
    .eq("split_id", splitId)
    .maybeSingle();
  if (error) throw error;
  if (!period) notFound();
  const split = period.splits as unknown as { id: string; name: string };

  let q = supabase
    .from("workout_sessions")
    .select("id, template_name, completed_at, session_exercises(exercise_id, exercise_name, skipped, position, exercises(tracking_mode), session_sets(set_type, weight_kg, reps, completed_at, position))")
    .eq("status", "completed")
    .eq("split_id", splitId)
    .gte("completed_at", period.started_at)
    .order("completed_at", { ascending: true });
  if (period.ended_at) q = q.lt("completed_at", period.ended_at);
  const res = await q;
  if (res.error) throw res.error;

  const sessions: ReviewSession[] = (res.data as unknown as Row[]).map((s) => ({
    id: s.id,
    performedAt: s.completed_at,
    workoutName: s.template_name,
    exercises: [...s.session_exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        exerciseId: e.exercise_id,
        name: e.exercise_name,
        mode: e.exercises?.tracking_mode ?? "weight_reps",
        skipped: e.skipped,
        sets: [...e.session_sets]
          .filter((x) => x.completed_at !== null && x.reps !== null)
          .sort((a, b) => a.position - b.position)
          .map((x) => ({ set_type: x.set_type, weight_kg: x.weight_kg === null ? null : Number(x.weight_kg), reps: x.reps! })),
      })),
  }));

  const end = period.ended_at ?? new Date().toISOString();
  const weeks = weeklyWorkingSets(sessions, tz, period.started_at, end);
  const totalSets = weeks.reduce((n, w) => n + w.sets, 0);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.sets));
  const breakdown = workoutBreakdown(sessions);
  const repeated = repeatedExercises(sessions);

  return (
    <>
      <PageHeader back={{ href: `/splits/${splitId}`, label: "Split" }} eyebrow="Split review" title={<span className="break-words">{split.name}</span>} />
      <p className="-mt-3 mb-5 text-[15px] text-muted">
        {formatDate(period.started_at, tz)} – {period.ended_at ? formatDate(period.ended_at, tz) : "now"} ·{" "}
        {period.ended_at ? `${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}` : `active for ${formatElapsed(period.started_at)}`}
      </p>

      {sessions.length === 0 ? (
        <EmptyState title="No workouts in this period yet">Completed workouts from this split appear here, grouped by week.</EmptyState>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-2">
            <Card className="p-4">
              <dt className="text-sm text-muted">Workouts completed</dt>
              <dd className="text-2xl font-semibold tabular">{sessions.length}</dd>
            </Card>
            <Card className="p-4">
              <dt className="text-sm text-muted">Working sets completed</dt>
              <dd className="text-2xl font-semibold tabular">{totalSets}</dd>
            </Card>
          </dl>

          <section aria-labelledby="by-workout">
            <h2 id="by-workout" className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">By workout</h2>
            <ul className="divide-y divide-line rounded-3xl border border-line bg-surface px-4">
              {breakdown.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 break-words">{b.name}</span>
                  <span className="shrink-0 text-muted tabular">{b.count}×</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="weekly">
            <h2 id="weekly" className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">Working sets per week</h2>
            <Card className="p-4">
              <ol className="space-y-2">
                {weeks.map((w) => (
                  <li key={w.week} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                    <span className="text-muted">w/c {formatShortDate(w.week + "T12:00:00Z", "UTC")}</span>
                    <span className="h-3 rounded-full bg-surface-3" aria-hidden="true">
                      <span className="block h-3 rounded-full bg-accent" style={{ width: `${(w.sets / maxWeek) * 100}%` }} />
                    </span>
                    <span className="text-right tabular">{w.sets}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-faint">Weeks run Monday to Sunday. Warm-ups and sets not marked done are not counted.</p>
            </Card>
          </section>

          <section aria-labelledby="repeated">
            <h2 id="repeated" className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">Repeated exercises</h2>
            {repeated.length ? (
              <ul className="space-y-2">
                {repeated.map((r) => (
                  <li key={r.exerciseId}>
                    <Link href={`/progress/${r.exerciseId}?period=${periodId}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:bg-surface-2/50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium break-words">{r.name}</span>
                        <span className="block text-sm text-muted tabular">
                          Best set: {formatSet(r.mode, r.first.set.weight_kg, r.first.set.reps)} ({formatShortDate(r.first.date, tz)}) →{" "}
                          {formatSet(r.mode, r.latest.set.weight_kg, r.latest.set.reps)} ({formatShortDate(r.latest.date, tz)})
                        </span>
                        {r.e1rm ? (
                          <span className="block text-sm text-faint tabular">Est. 1RM {formatKg(r.e1rm.first)} → {formatKg(r.e1rm.latest)} kg (estimate)</span>
                        ) : null}
                        <span className="block text-xs text-faint">{r.sessions} sessions in this period</span>
                      </span>
                      <IconChevronRight className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
                Not enough data yet. Comparisons appear once an exercise has been done in at least two workouts in this period.
              </p>
            )}
          </section>

          <section aria-labelledby="sessions-title">
            <h2 id="sessions-title" className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">Workouts</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {[...sessions].reverse().map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.workoutName}</span>
                      <span className="block text-sm text-muted">{formatDate(s.performedAt, tz, { weekday: "short" })}</span>
                    </span>
                    <IconChevronRight className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-sm text-faint">
            “Best set” is the strongest completed working set in a session (highest estimated 1RM for weight × reps, most reps for bodyweight). This review
            describes what you logged. It does not score consistency or explain why numbers changed. Workout and exercise names are shown as they were when logged.
          </p>
        </div>
      )}
    </>
  );
}
