import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomExerciseEditor } from "@/components/CustomExerciseEditor";
import { HistoryFilter } from "@/components/HistoryFilter";
import { ProgressChart } from "@/components/ProgressChart";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { cx } from "@/components/styles";
import { EXERCISE_COLUMNS, exerciseLabel } from "@/lib/exercises";
import { formatDate, formatSet, humanize } from "@/lib/format";
import { bestSetOverall, metricsFor, progressSeries, sessionE1RM, type HistorySession } from "@/lib/progress";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";
import type { Exercise } from "@/lib/types";

export const metadata: Metadata = { title: "Exercise history" };

export default async function ExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ split?: string; period?: string; metric?: string }>;
}) {
  const { exerciseId } = await params;
  const { split, period, metric: metricParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(exerciseId)) notFound();
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();

  const [ex, history, splits, periods] = await Promise.all([
    supabase.from("exercises").select(EXERCISE_COLUMNS).eq("id", exerciseId).maybeSingle(),
    supabase.rpc("exercise_history", { p_exercise_id: exerciseId, p_split_id: uuid(split), p_period_id: uuid(period) }),
    supabase.from("splits").select("id, name").order("name"),
    supabase.from("split_active_periods").select("id, started_at, ended_at, splits(name)").order("started_at", { ascending: false }),
  ]);
  if (ex.error) throw ex.error;
  if (!ex.data) notFound();
  if (history.error) throw history.error;
  const exercise = ex.data as Exercise;
  const sessions = history.data as HistorySession[];
  const filtered = Boolean(uuid(split) || uuid(period));
  const metrics = metricsFor(exercise.tracking_mode);
  const metric = metrics.find((m) => m.id === metricParam) ?? metrics[0];
  const points = progressSeries(sessions, exercise.tracking_mode, metric.id);
  const best = bestSetOverall(sessions, exercise.tracking_mode);
  const query = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (uuid(split)) q.set("split", split!);
    if (uuid(period)) q.set("period", period!);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    const str = q.toString();
    return `/progress/${exerciseId}${str ? `?${str}` : ""}`;
  };

  return (
    <>
      <PageHeader
        back={{ href: "/progress", label: "Progress" }}
        eyebrow={`${humanize(exercise.primary_muscle)} · ${humanize(exercise.equipment)}${exercise.owner_id ? " · custom" : ""}`}
        title={exerciseLabel(exercise)}
        action={exercise.owner_id ? <CustomExerciseEditor exercise={exercise} /> : null}
      />

      <div className="space-y-6">
        <HistoryFilter
          splits={splits.data ?? []}
          periods={(periods.data ?? []).map((p) => ({
            id: p.id,
            label: `${(p.splits as unknown as { name: string } | null)?.name ?? "Split"}: ${formatDate(p.started_at, tz)} – ${p.ended_at ? formatDate(p.ended_at, tz) : "now"}`,
          }))}
          value={uuid(period) ? `period:${period}` : uuid(split) ? `split:${split}` : ""}
          metric={metric.id === metrics[0].id ? null : metric.id}
        />

        {sessions.length === 0 ? (
          <EmptyState title={filtered ? "No sessions in this view" : "No history yet"}>
            {filtered ? "Try all history." : "Once you finish a workout that includes this exercise, every session appears here, whichever split it was in."}
          </EmptyState>
        ) : (
          <>
            {best ? (
              <Card className="p-4">
                <p className="text-sm text-muted">Best set{filtered ? " in this view" : ""}</p>
                <p className="mt-0.5 text-lg font-semibold tabular">
                  {best.text}
                  {best.e1rm !== null ? <span className="ml-2 text-base font-normal text-muted">≈ {best.e1rm} kg est. 1RM</span> : null}
                </p>
                <p className="text-sm text-faint">{formatDate(best.date, tz, { weekday: "short" })} · {best.workout}</p>
              </Card>
            ) : null}
            {points.length ? (
              <Card className="p-4">
                {metrics.length > 1 ? (
                  <nav aria-label="Chart metric" className="mb-4 flex gap-1 rounded-2xl bg-field p-1">
                    {metrics.map((m) => (
                      <Link
                        key={m.id}
                        href={query({ metric: m.id === metrics[0].id ? null : m.id })}
                        replace
                        scroll={false}
                        aria-current={m.id === metric.id ? "true" : undefined}
                        className={cx(
                          "flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-medium transition",
                          m.id === metric.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
                        )}
                      >
                        {m.label}
                      </Link>
                    ))}
                  </nav>
                ) : null}
                <h2 className="font-medium">{metric.title}</h2>
                <p className="mb-3 text-sm text-muted">{metric.description}</p>
                <ProgressChart points={points} title={metric.title} unit={metric.unit} timeZone={tz} />
              </Card>
            ) : null}
            {filtered ? (
              <p className="text-sm text-faint">Showing a subset of sessions. Differences between periods are observations, not proof that a split caused them.</p>
            ) : null}
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </h2>
              <ol className="space-y-3">
                {sessions.map((s) => (
                  <li key={s.session_id}>
                    <Link href={`/sessions/${s.session_id}`} className="block rounded-3xl border border-line bg-surface p-4 hover:bg-surface-2/50">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium">{formatDate(s.completed_at, tz, { weekday: "short" })}</p>
                        {exercise.tracking_mode === "weight_reps" && sessionE1RM(s.sets) !== null ? (
                          <p className="shrink-0 text-sm text-muted tabular">≈ {sessionE1RM(s.sets)} kg est. 1RM</p>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted">{s.template_name}{s.split_name ? ` · ${s.split_name}` : ""}</p>
                      <table className="mt-2 text-sm tabular">
                        <caption className="sr-only">Sets on {formatDate(s.completed_at, tz)}</caption>
                        <tbody>
                          {s.sets.map((set, i) => (
                            <tr key={i} className={cx(set.set_type === "warmup" && "text-faint")}>
                              <th scope="row" className="pr-4 text-left font-normal text-muted">{set.set_type === "warmup" ? "Warm-up" : `Set ${s.sets.slice(0, i + 1).filter((x) => x.set_type === "working").length}`}</th>
                              <td>{formatSet(exercise.tracking_mode, set.weight_kg, set.reps)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </>
  );
}
