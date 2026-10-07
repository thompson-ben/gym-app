import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupWorkoutView } from "@/components/together/GroupWorkoutView";
import type { GroupDoc } from "@/lib/group";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Group workout" };

export default async function GroupWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const [{ data, error }, tz, inProgress] = await Promise.all([
    supabase.rpc("group_workout_document", { p_group_id: id }),
    viewerTimeZone(),
    supabase.from("workout_sessions").select("id, group_workout_id").eq("status", "in_progress").maybeSingle(),
  ]);
  if (error) throw error;
  // Not a member (left, removed, or the group was deleted).
  if (!data) notFound();
  const doc = data as GroupDoc;
  // Another workout already in progress blocks starting this one.
  const otherOpen = inProgress.data && inProgress.data.group_workout_id !== doc.id ? inProgress.data.id : null;
  return <GroupWorkoutView key={JSON.stringify(doc)} doc={doc} timeZone={tz} otherOpenSessionId={otherOpen} />;
}
