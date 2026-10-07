import type { Metadata } from "next";
import { NewGroupWorkoutForm, type WorkoutOption } from "@/components/together/NewGroupWorkoutForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plan a group workout" };

type SplitRow = { id: string; name: string; workout_templates: { id: string; name: string; position: number; template_exercises: { id: string }[] }[] };

export default async function NewGroupWorkoutPage() {
  const { supabase } = await requireUser();
  const [splits, active, profile] = await Promise.all([
    supabase.from("splits").select("id, name, workout_templates(id, name, position, template_exercises(id))").is("archived_at", null).order("created_at"),
    supabase.from("split_active_periods").select("split_id").is("ended_at", null).maybeSingle(),
    supabase.from("profiles").select("display_name").maybeSingle(),
  ]);
  if (splits.error) throw splits.error;
  // The active split first, then the rest.
  const rows = [...(splits.data as unknown as SplitRow[])].sort((a, b) => Number(b.id === active.data?.split_id) - Number(a.id === active.data?.split_id));
  const workouts: WorkoutOption[] = rows.flatMap((s) =>
    [...s.workout_templates]
      .sort((a, b) => a.position - b.position)
      .filter((t) => t.template_exercises.length > 0)
      .map((t) => ({ id: t.id, name: t.name, splitName: s.name, exerciseCount: t.template_exercises.length })),
  );

  return (
    <>
      <PageHeader title="Plan a group workout" back={{ href: "/train", label: "Train" }} />
      <NewGroupWorkoutForm workouts={workouts} defaultDisplayName={profile.data?.display_name ?? ""} />
    </>
  );
}
