import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { ExerciseSearchList } from "@/components/ExerciseSearchList";
import { PageTip } from "@/components/PageTip";
import { EmptyState, PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/styles";
import { exerciseLabel } from "@/lib/exercises";
import { formatDate } from "@/lib/format";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();
  const [performed, sessions, period, total] = await Promise.all([
    supabase.rpc("performed_exercises"),
    supabase
      .from("workout_sessions")
      .select("id, template_name, split_name, completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(3),
    supabase.from("split_active_periods").select("id, started_at, split_id, splits(name)").is("ended_at", null).maybeSingle(),
    supabase.from("workout_sessions").select("id", { count: "exact", head: true }).eq("status", "completed"),
  ]);
  if (performed.error) throw performed.error;
  if (sessions.error) throw sessions.error;
  const rows = performed.data as { exercise_id: string; last_completed_at: string; session_count: number }[];
  const ids = rows.map((r) => r.exercise_id);
  const { data: exercises, error } = ids.length
    ? await supabase.from("exercises").select("id, name, variant, primary_muscle").in("id", ids)
    : { data: [], error: null };
  if (error) throw error;
  const byId = new Map((exercises ?? []).map((e) => [e.id, e]));
  const items = rows
    .map((r) => {
      const e = byId.get(r.exercise_id);
      return e
        ? { id: r.exercise_id, name: exerciseLabel(e), muscle: e.primary_muscle, meta: `${Number(r.session_count)} ${Number(r.session_count) === 1 ? "session" : "sessions"} · last ${formatDate(r.last_completed_at, tz)}` }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <PageHeader title="Progress" />
      {items.length === 0 ? (
        <EmptyState title="No history yet" action={<Link href="/train" className={buttonClass("primary")}>Go to Train</Link>}>
          Finish a workout and each exercise’s history appears here, whichever split or workout it was logged in.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <PageTip id="progress" title="Reading your progress">
            <p>Tap an exercise for its chart (Est. 1RM, Volume or Heaviest) and every session, across all your splits.</p>
            <p>Workout history and Split review are just below.</p>
          </PageTip>
          <nav aria-label="Reviews" className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            <Link href="/history" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:bg-surface-2/60">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Workout history</span>
                <span className="block text-sm text-muted">{total.count ?? 0} completed {total.count === 1 ? "workout" : "workouts"}</span>
              </span>
              <IconChevronRight className="shrink-0 text-faint" />
            </Link>
            {period.data ? (
              <Link
                href={`/splits/${period.data.split_id}/review/${period.data.id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:bg-surface-2/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Split review</span>
                  <span className="block truncate text-sm text-muted">
                    {(period.data.splits as unknown as { name: string } | null)?.name} · since {formatDate(period.data.started_at, tz, { year: undefined })}
                  </span>
                </span>
                <IconChevronRight className="shrink-0 text-faint" />
              </Link>
            ) : null}
          </nav>
          <section>
            <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">Exercises</h2>
            <ExerciseSearchList items={items} />
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Recent workouts</h2>
              <Link href="/history" className="text-sm text-accent-text underline-offset-4 hover:underline">All workouts</Link>
            </div>
            <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
              {sessions.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.template_name}</span>
                      <span className="block truncate text-sm text-muted">
                        {formatDate(s.completed_at!, tz, { weekday: "short" })}{s.split_name ? ` · ${s.split_name}` : ""}
                      </span>
                    </span>
                    <IconChevronRight className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
