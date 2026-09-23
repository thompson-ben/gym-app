import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateBuilder, type Entry } from "@/components/splits/TemplateBuilder";
import { EXERCISE_COLUMNS } from "@/lib/exercises";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit workout" };

export default async function TemplatePage({ params }: { params: Promise<{ splitId: string; templateId: string }> }) {
  const { splitId, templateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) notFound();
  const { supabase } = await requireUser();
  const [tpl, entries, profile] = await Promise.all([
    supabase.from("workout_templates").select("id, name, split_id, splits(name)").eq("id", templateId).eq("split_id", splitId).maybeSingle(),
    supabase
      .from("template_exercises")
      .select(`id, position, target_sets, rep_min, rep_max, rest_seconds, notes, exercise:exercises(${EXERCISE_COLUMNS})`)
      .eq("template_id", templateId)
      .order("position")
      .order("created_at"),
    supabase.from("profiles").select("default_rest_seconds").maybeSingle(),
  ]);
  if (tpl.error) throw tpl.error;
  if (!tpl.data) notFound();
  if (entries.error) throw entries.error;
  const splitName = (tpl.data.splits as unknown as { name: string } | null)?.name ?? "Split";

  return (
    <TemplateBuilder
      splitId={splitId}
      splitName={splitName}
      template={{ id: tpl.data.id, name: tpl.data.name }}
      initialEntries={entries.data as unknown as Entry[]}
      defaultRest={profile.data?.default_rest_seconds ?? 120}
    />
  );
}
