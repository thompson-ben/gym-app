import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { ExerciseSearchList } from "@/components/ExerciseSearchList";
import { EmptyState, PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/styles";
import { exerciseLabel } from "@/lib/exercises";
import { formatDate } from "@/lib/format";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();
  const [performed, sessions] = await Promise.all([
    supabase.rpc("performed_exercises"),
    supabase
      .from("workout_sessions")
      .select("id, template_name, split_name, completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(8),
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
          <section>
            <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">Exercises</h2>
            <ExerciseSearchList items={items} />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">Recent workouts</h2>
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
