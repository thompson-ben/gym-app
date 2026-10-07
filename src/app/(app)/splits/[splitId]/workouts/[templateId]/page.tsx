import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateBuilder, type Entry } from "@/components/splits/TemplateBuilder";
import { EXERCISE_COLUMNS } from "@/lib/exercises";
import { requireUser } from "@/lib/supabase/server";
import { isWeightUnit } from "@/lib/units";

export const metadata: Metadata = { title: "Edit workout" };

export default async function TemplatePage({ params }: { params: Promise<{ splitId: string; templateId: string }> }) {
  const { splitId, templateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) notFound();
  const { supabase } = await requireUser();
  const [tpl, entries, profile] = await Promise.all([
    supabase.from("workout_templates").select("id, name, split_id, splits(name)").eq("id", templateId).eq("split_id", splitId).maybeSingle(),
    supabase
      .from("template_exercises")
      .select(`id, position, target_sets, rep_min, rep_max, rest_seconds, notes, progression_enabled, progression_increment_kg, exercise:exercises(${EXERCISE_COLUMNS})`)
      .eq("template_id", templateId)
      .order("position")
      .order("created_at"),
    supabase.from("profiles").select("default_rest_seconds, weight_unit").maybeSingle(),
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
      unit={isWeightUnit(profile.data?.weight_unit) ? profile.data.weight_unit : "kg"}
    />
  );
}
