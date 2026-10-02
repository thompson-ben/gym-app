import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight, IconPlay } from "@/components/icons";
import { buttonClass, cx } from "@/components/styles";
import { QuickWorkoutButton } from "@/components/QuickWorkoutButton";
import { LogPastWorkoutButton, StartWorkoutButton } from "@/components/StartWorkoutButton";
import { Wordmark } from "@/components/Wordmark";
import { formatDate, formatElapsed, formatShortDate } from "@/lib/format";
import { suggestNextWorkout, type NextWorkout } from "@/lib/next-workout";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Train" };

type TemplateRow = {
  id: string;
  name: string;
  position: number;
  template_exercises: { target_sets: number }[];
};

type WorkoutSummary = { id: string; name: string; position: number; exerciseCount: number; workingSets: number; lastPerformed: string | null };

export default async function TrainPage() {
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();

  const [{ data: period, error: periodError }, { data: open, error: openError }, recent] = await Promise.all([
    supabase.from("split_active_periods").select("id, started_at, split_id, splits(id, name)").is("ended_at", null).maybeSingle(),
    supabase.from("workout_sessions").select("id, template_name, split_name, started_at, is_backdated").eq("status", "in_progress").maybeSingle(),
    supabase.from("workout_sessions").select("id, template_name, completed_at, split_id").eq("status", "completed").order("completed_at", { ascending: false }).limit(3),
  ]);
  if (periodError) throw periodError;
  if (openError) throw openError;
  if (recent.error) throw recent.error;

  const split = period?.splits as unknown as { id: string; name: string } | null;
  let workouts: WorkoutSummary[] = [];
  let periodCount = 0;
  let next: NextWorkout | null = null;

  if (period && split) {
    const tpl = await supabase
      .from("workout_templates")
      .select("id, name, position, template_exercises(target_sets)")
      .eq("split_id", split.id)
      .order("position")
      .order("created_at");
    if (tpl.error) throw tpl.error;
    const rows = tpl.data as unknown as TemplateRow[];
    const ids = rows.map((t) => t.id);
    // Performed dates of this split's workouts (completed_at is when it was performed,
    // including for past workouts logged later).
    const history = ids.length
      ? await supabase
          .from("workout_sessions")
          .select("template_id, split_id, completed_at")
          .eq("status", "completed")
          .in("template_id", ids)
          .order("completed_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };
    if (history.error) throw history.error;
    const performed = (history.data ?? []) as { template_id: string; split_id: string | null; completed_at: string }[];
    const last = new Map<string, string>();
    for (const s of performed) if (!last.has(s.template_id)) last.set(s.template_id, s.completed_at);

    workouts = rows.map((t, i) => ({
      id: t.id,
      name: t.name,
      position: i,
      exerciseCount: t.template_exercises.length,
      workingSets: t.template_exercises.reduce((n, e) => n + e.target_sets, 0),
      lastPerformed: last.get(t.id) ?? null,
    }));
    const inPeriod = performed.filter((s) => s.split_id === split.id && s.completed_at >= period.started_at);
    const countRes = await supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .eq("split_id", split.id)
      .gte("completed_at", period.started_at);
    if (countRes.error) throw countRes.error;
    periodCount = countRes.count ?? 0;
    next = suggestNextWorkout({
      workouts,
      periodSessions: inPeriod.map((s) => ({ templateId: s.template_id, performedAt: s.completed_at })),
      trainedInEarlierPeriod: performed.some((s) => s.split_id === split.id && s.completed_at < period.started_at),
    });
  }

  const suggested = next && next.kind !== "choose" ? workouts.find((w) => w.id === next.templateId) ?? null : null;
  const others = workouts.filter((w) => w.id !== suggested?.id);
  const startable = workouts.filter((w) => w.exerciseCount > 0);

  return (
    <div className="pt-safe">
      <div className="flex h-14 items-center justify-between gap-2">
        <Wordmark />
        {split && !open && startable.length ? <LogPastWorkoutButton workouts={startable} size="sm" label="Log past workout" /> : null}
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
            <span className="block text-sm opacity-80">
              {open.is_backdated ? "Past workout for " : "Started "}
              {formatDate(open.started_at, tz, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </span>
          <IconChevronRight />
        </Link>
      ) : null}

      {split && period ? (
        <>
          <Link
            href={`/splits/${split.id}`}
            className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-2/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium tracking-[0.14em] text-muted uppercase">Active split</span>
              <span className="mt-0.5 block line-clamp-2 font-semibold">{split.name}</span>
              <span className="mt-0.5 block text-sm text-muted">
                Since {formatShortDate(period.started_at, tz)} · {formatElapsed(period.started_at)}
                {" · "}
                <span className="tabular">{periodCount}</span> {periodCount === 1 ? "workout" : "workouts"} completed
              </span>
            </span>
            <IconChevronRight className="shrink-0 text-faint" />
          </Link>

          {!open && suggested && next && next.kind !== "choose" ? (
            <section aria-labelledby="up-next" className="mt-4 rounded-3xl border border-line bg-surface p-5">
              <p id="up-next" className="text-xs font-medium tracking-[0.14em] text-accent-text uppercase">
                Suggested next
              </p>
              <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-[-0.02em] break-words">{suggested.name}</h1>
              <p className="mt-1 text-[15px] text-muted">
                {count(suggested.exerciseCount, "exercise")} · {count(suggested.workingSets, "working set")}
              </p>
              <p className="text-[15px] text-muted">{suggested.lastPerformed ? `Last performed ${formatShortDate(suggested.lastPerformed, tz)}` : "Not performed yet"}</p>
              <p className="mt-3 text-sm text-faint">{next.reason}</p>
              <div className="mt-4 flex gap-2">
                <StartWorkoutButton templateId={suggested.id} size="lg" label="Start" ariaLabel={`Start ${suggested.name}`} className="min-w-0 flex-1" />
                <Link href={`/train/workout/${suggested.id}`} className={buttonClass("secondary", "lg")}>Preview</Link>
              </div>
            </section>
          ) : !open && workouts.length ? (
            <section className="mt-4 rounded-3xl border border-line bg-surface p-5">
              <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">Choose a workout</h1>
              <p className="mt-1 text-[15px] text-muted">{next?.reason}</p>
            </section>
          ) : null}

          {workouts.length ? (
            <section className="mt-6" aria-labelledby="workouts-title">
              <h2 id="workouts-title" className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">
                {suggested && !open ? "Other workouts" : "Workouts"}
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {(open ? workouts : others).map((w) => (
                  <li key={w.id} className="flex items-center gap-2 pr-3">
                    <Link href={`/train/workout/${w.id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 hover:bg-surface-2/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{w.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {w.exerciseCount ? count(w.exerciseCount, "exercise") : "No exercises yet"} ·{" "}
                          {w.lastPerformed ? `last ${formatShortDate(w.lastPerformed, tz)}` : "not performed yet"}
                        </span>
                      </span>
                    </Link>
                    {!open && w.exerciseCount ? (
                      <StartWorkoutButton templateId={w.id} variant="secondary" size="sm" ariaLabel={`Start ${w.name}`} />
                    ) : (
                      <IconChevronRight className="shrink-0 text-faint" />
                    )}
                  </li>
                ))}
              </ul>
              {open ? <p className="mt-2 text-sm text-faint">Finish or discard the workout in progress to start another.</p> : null}
            </section>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-line px-6 py-8 text-center">
              <p className="font-medium">This split has no workouts yet</p>
              <Link href={`/splits/${split.id}`} className={buttonClass("primary", "md", "mt-4")}>Add a workout</Link>
            </div>
          )}
          <div className="mt-3">
            <QuickWorkoutButton disabled={Boolean(open)} />
          </div>
        </>
      ) : (
        <section className="pt-6">
          <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Ready to train?</h1>
          <p className="mt-2 text-muted">Activate a split to see what’s next here. Only one split is active at a time; your exercise history carries across all of them.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/splits?new=1" className={buttonClass("primary", "lg")}>Create a split</Link>
            <Link href="/splits" className={buttonClass("secondary", "lg")}>Choose a split</Link>
          </div>
          <div className="mt-6">
            <QuickWorkoutButton disabled={Boolean(open)} />
          </div>
        </section>
      )}

      {recent.data.length ? (
        <section className="mt-8" aria-labelledby="recent-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-title" className="text-sm font-medium tracking-wide text-muted uppercase">Recent</h2>
            <Link href="/history" className="text-sm text-accent-text underline-offset-4 hover:underline">All workouts</Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {recent.data.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className={cx("flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.template_name}</span>
                    <span className="block text-sm text-muted">{formatDate(s.completed_at!, tz, { weekday: "short" })}</span>
                  </span>
                  <IconChevronRight className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function count(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}
