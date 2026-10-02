import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { buttonClass } from "@/components/styles";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Workout history" };

const PAGE = 60;

/** Every completed workout, newest first, grouped by month (by date performed). */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { before } = await searchParams;
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();
  let q = supabase
    .from("workout_sessions")
    .select("id, template_name, split_name, completed_at, is_backdated, template_id")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(PAGE + 1);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("completed_at", before);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data.slice(0, PAGE);
  const more = data.length > PAGE;
  const months = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = formatDate(r.completed_at!, tz, { day: undefined, month: "long", year: "numeric" });
    months.set(key, [...(months.get(key) ?? []), r]);
  }

  return (
    <>
      <PageHeader back={{ href: "/progress", label: "Progress" }} title="Workout history" />
      {rows.length === 0 ? (
        <EmptyState title="No workouts yet" action={<Link href="/train" className={buttonClass("primary")}>Go to Train</Link>}>
          Finished workouts appear here, newest first.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...months.entries()].map(([month, list]) => (
            <section key={month} aria-label={month}>
              <h2 className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">{month}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sessions/${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
                      <span className="w-11 shrink-0 text-center leading-tight">
                        <span className="block text-xs text-muted">{formatDate(s.completed_at!, tz, { weekday: "short", day: undefined, month: undefined, year: undefined })}</span>
                        <span className="block text-lg font-semibold tabular">{formatDate(s.completed_at!, tz, { day: "numeric", month: undefined, year: undefined })}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.template_name}</span>
                        <span className="block truncate text-sm text-muted">
                          {s.split_name ?? (s.template_id ? "" : "Quick workout")}
                          {s.is_backdated ? `${s.split_name || !s.template_id ? " · " : ""}logged afterwards` : ""}
                        </span>
                      </span>
                      <IconChevronRight className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {more ? (
            <Link href={`/history?before=${encodeURIComponent(rows.at(-1)!.completed_at!)}`} className={buttonClass("secondary", "md", "w-full")}>
              Older workouts
            </Link>
          ) : null}
        </div>
      )}
    </>
  );
}
