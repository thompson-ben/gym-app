import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { NewSplitButton } from "@/components/splits/NewSplitButton";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Splits" };

type Row = {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  workout_templates: { count: number }[];
  split_active_periods: { started_at: string; ended_at: string | null }[];
};

export default async function SplitsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();
  const { new: openNew } = await searchParams;
  const { data, error } = await supabase
    .from("splits")
    .select("id, name, description, archived_at, created_at, workout_templates(count), split_active_periods(started_at, ended_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as Row[];
  const openPeriod = (r: Row) => r.split_active_periods.find((p) => p.ended_at === null);
  const active = rows.filter((r) => openPeriod(r));
  const saved = rows.filter((r) => !r.archived_at && !openPeriod(r));
  const archived = rows.filter((r) => r.archived_at);

  const item = (r: Row) => {
    const period = openPeriod(r);
    const lastUsed = r.split_active_periods.map((p) => p.ended_at).filter(Boolean).sort().at(-1);
    const count = r.workout_templates[0]?.count ?? 0;
    return (
      <li key={r.id}>
        <Link href={`/splits/${r.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 transition hover:bg-surface-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-lg font-semibold">{r.name}</h3>
              {period ? <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">Active</span> : null}
            </div>
            <p className="text-sm text-muted">
              {count} {count === 1 ? "workout" : "workouts"}
              {period ? ` · since ${formatDate(period.started_at, tz)}` : lastUsed ? ` · last active ${formatDate(lastUsed, tz)}` : ""}
            </p>
            {r.description ? <p className="mt-1 line-clamp-1 text-sm text-faint">{r.description}</p> : null}
          </div>
          <IconChevronRight className="shrink-0 text-faint" />
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Splits" action={<NewSplitButton autoOpen={openNew === "1"} />} />
      {rows.length === 0 ? (
        <EmptyState title="No splits yet" action={<NewSplitButton label="Create your first split" variant="primary" />}>
          A split is a set of workouts you rotate through, like Push / Pull / Legs. Your exercise history is kept separately, so changing splits never loses it.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {active.length ? <ul className="space-y-3">{active.map(item)}</ul> : null}
          {saved.length ? (
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">Saved splits</h2>
              <ul className="space-y-3">{saved.map(item)}</ul>
            </section>
          ) : null}
          {archived.length ? (
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">Archived</h2>
              <ul className="space-y-3 opacity-80">{archived.map(item)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
