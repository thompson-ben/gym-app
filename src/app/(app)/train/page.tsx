import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight, IconPlay } from "@/components/icons";
import { buttonClass } from "@/components/styles";
import { StartWorkoutButton } from "@/components/StartWorkoutButton";
import { Wordmark } from "@/components/Wordmark";
import { formatDate, formatElapsed } from "@/lib/format";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Train" };

type TemplateRow = {
  id: string;
  name: string;
  position: number;
  template_exercises: { position: number; exercises: { name: string } | null }[];
};

export default async function TrainPage() {
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();

  const [{ data: period, error: periodError }, { data: open, error: openError }] = await Promise.all([
    supabase.from("split_active_periods").select("id, started_at, split_id, splits(id, name, description)").is("ended_at", null).maybeSingle(),
    supabase.from("workout_sessions").select("id, template_name, split_name, started_at").eq("status", "in_progress").maybeSingle(),
  ]);
  if (periodError) throw periodError;
  if (openError) throw openError;

  const split = period?.splits as unknown as { id: string; name: string; description: string | null } | null;
  let templates: TemplateRow[] = [];
  let completedCount = 0;
  if (period && split) {
    const [tpl, count] = await Promise.all([
      supabase
        .from("workout_templates")
        .select("id, name, position, template_exercises(position, exercises(name))")
        .eq("split_id", split.id)
        .order("position")
        .order("created_at"),
      supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .eq("split_id", split.id)
        .gte("completed_at", period.started_at),
    ]);
    if (tpl.error) throw tpl.error;
    templates = tpl.data as unknown as TemplateRow[];
    completedCount = count.count ?? 0;
  }

  return (
    <div className="pt-safe">
      <div className="flex h-14 items-center">
        <Wordmark />
      </div>

      {open ? (
        <Link
          href={`/workout/${open.id}`}
          className="mt-2 flex items-center gap-4 rounded-3xl bg-accent p-4 text-accent-ink transition hover:brightness-105"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-ink/10">
            <IconPlay size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium opacity-80">Workout in progress</span>
            <span className="block truncate text-lg font-semibold">Resume {open.template_name}</span>
            <span className="block text-sm opacity-80">Started {formatDate(open.started_at, tz, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </span>
          <IconChevronRight />
        </Link>
      ) : null}

      {split && period ? (
        <>
          <section className="pt-6 pb-5">
            <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted uppercase">Active split</p>
            <h1 className="text-[36px] leading-[1.1] font-semibold tracking-[-0.03em]">
              <Link href={`/splits/${split.id}`} className="hover:underline underline-offset-4">{split.name}</Link>
            </h1>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-muted">Since</dt>
                <dd>{formatDate(period.started_at, tz)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Running</dt>
                <dd>{formatElapsed(period.started_at)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Completed</dt>
                <dd className="tabular">{completedCount} {completedCount === 1 ? "workout" : "workouts"}</dd>
              </div>
            </dl>
          </section>

          <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">Workouts</h2>
          {templates.length ? (
            <ul className="space-y-3">
              {templates.map((t) => {
                const names = [...t.template_exercises].sort((a, b) => a.position - b.position).map((e) => e.exercises?.name).filter(Boolean);
                return (
                  <li key={t.id} className="rounded-3xl border border-line bg-surface p-4">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-semibold">{t.name}</h3>
                        <p className="text-sm text-muted">
                          {names.length} {names.length === 1 ? "exercise" : "exercises"}
                        </p>
                      </div>
                      {open ? (
                        <span className="text-right text-xs text-faint">Finish current<br />workout first</span>
                      ) : (
                        <StartWorkoutButton templateId={t.id} disabled={names.length === 0} />
                      )}
                    </div>
                    {names.length ? <p className="mt-2 line-clamp-2 text-sm text-faint">{names.join(" · ")}</p> : (
                      <p className="mt-2 text-sm text-faint">
                        No exercises yet. <Link href={`/splits/${split.id}/workouts/${t.id}`} className="text-accent-text">Add some</Link>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-3xl border border-dashed border-line px-6 py-8 text-center">
              <p className="font-medium">This split has no workouts yet</p>
              <Link href={`/splits/${split.id}`} className={buttonClass("primary", "md", "mt-4")}>Add a workout</Link>
            </div>
          )}
        </>
      ) : (
        <section className="pt-6">
          <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Ready to train?</h1>
          <p className="mt-2 text-muted">Activate a split to see its workouts here. Only one split is active at a time; your exercise history carries across all of them.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/splits?new=1" className={buttonClass("primary", "lg")}>Create a split</Link>
            <Link href="/splits" className={buttonClass("secondary", "lg")}>Choose a split</Link>
          </div>
        </section>
      )}
    </div>
  );
}
