import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivationCard } from "@/components/splits/ActivationCard";
import { PeriodsList } from "@/components/splits/PeriodsList";
import { ShareCard } from "@/components/splits/ShareCard";
import { SplitActions } from "@/components/splits/SplitActions";
import { WorkoutList, type TemplateSummary } from "@/components/splits/WorkoutList";
import { PageHeader } from "@/components/ui";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Split" };

export type Period = { id: string; started_at: string; ended_at: string | null; completed_workouts: number };

export default async function SplitPage({ params }: { params: Promise<{ splitId: string }> }) {
  const { splitId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(splitId)) notFound();
  const { supabase } = await requireUser();
  const tz = await viewerTimeZone();

  const [split, templates, periods, share] = await Promise.all([
    supabase.from("splits").select("id, name, description, archived_at, copied_from_share_id").eq("id", splitId).maybeSingle(),
    supabase
      .from("workout_templates")
      .select("id, name, position, template_exercises(position, exercises(name))")
      .eq("split_id", splitId)
      .order("position")
      .order("created_at"),
    supabase.rpc("split_periods", { p_split_id: splitId }),
    supabase
      .from("split_shares")
      .select("id, token, name, description, include_notes, snapshot_at")
      .eq("split_id", splitId)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);
  if (split.error) throw split.error;
  if (!split.data) notFound();
  if (templates.error) throw templates.error;
  if (periods.error) throw periods.error;

  const s = split.data;
  const periodRows = (periods.data as Period[]).map((p) => ({ ...p, completed_workouts: Number(p.completed_workouts) }));
  const open = periodRows.find((p) => p.ended_at === null) ?? null;
  const tpl: TemplateSummary[] = (templates.data as unknown as { id: string; name: string; template_exercises: { position: number; exercises: { name: string } | null }[] }[]).map((t) => ({
    id: t.id,
    name: t.name,
    exercises: [...t.template_exercises].sort((a, b) => a.position - b.position).map((e) => e.exercises?.name ?? ""),
  }));

  return (
    <>
      <PageHeader
        back={{ href: "/splits", label: "Splits" }}
        eyebrow={s.archived_at ? "Archived split" : open ? "Active split" : "Split"}
        title={s.name}
        action={<SplitActions split={s} isActive={Boolean(open)} />}
      />
      {s.description ? <p className="-mt-3 mb-5 text-muted">{s.description}</p> : null}
      {s.copied_from_share_id ? <p className="-mt-2 mb-5 text-sm text-faint">Copied from a shared split. It is your own independent copy.</p> : null}

      <div className="space-y-8">
        {!s.archived_at ? <ActivationCard splitId={s.id} open={open} timeZone={tz} /> : null}
        <WorkoutList splitId={s.id} templates={tpl} />
        <ShareCard splitId={s.id} splitName={s.name} splitDescription={s.description} share={share.data ?? null} timeZone={tz} />
        <PeriodsList periods={periodRows} timeZone={tz} />
      </div>
    </>
  );
}
