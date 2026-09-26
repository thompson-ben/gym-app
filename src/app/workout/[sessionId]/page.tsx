import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClientBoot } from "@/components/ClientBoot";
import { LoggerLoader } from "@/components/logger/LoggerLoader";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";
import type { PreviousMap, PreviousPerformance, SessionDoc } from "@/lib/types";

export const metadata: Metadata = { title: "Workout" };

export default async function WorkoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase, userId } = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();

  const { data: doc, error } = await supabase.rpc("session_document", { p_session_id: sessionId });
  if (error) throw error;
  if (!doc) notFound();
  const session = doc as SessionDoc;
  if (session.status === "completed") redirect(`/sessions/${sessionId}`);
  if (session.status === "discarded") redirect("/train");

  const ids = [...new Set(session.exercises.map((e) => e.exercise_id))];
  const [{ data: prev, error: prevError }, { data: profile }] = await Promise.all([
    // A past workout compares with the workout before its date, not the latest one.
    supabase.rpc("previous_performance", { p_exercise_ids: ids, p_before: session.is_backdated ? session.started_at : null }),
    supabase.from("profiles").select("default_rest_seconds, auto_start_rest").eq("id", userId).single(),
  ]);
  if (prevError) throw prevError;
  const previous: PreviousMap = Object.fromEntries((prev as PreviousPerformance[]).map((p) => [p.exercise_id, p]));

  return (
    <>
      <ClientBoot userId={userId} />
      <LoggerLoader
        userId={userId}
        server={session}
        previous={previous}
        settings={{ defaultRestSeconds: profile?.default_rest_seconds ?? 120, autoStartRest: profile?.auto_start_rest ?? false }}
        timeZone={await viewerTimeZone()}
      />
    </>
  );
}
