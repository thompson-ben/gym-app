import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SessionView } from "@/components/SessionView";
import { requireUser, viewerTimeZone } from "@/lib/supabase/server";
import type { SessionDoc } from "@/lib/types";

export const metadata: Metadata = { title: "Workout" };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ finished?: string }> }) {
  const { sessionId } = await params;
  const { finished } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("session_document", { p_session_id: sessionId });
  if (error) throw error;
  if (!data) notFound();
  const doc = data as SessionDoc;
  if (doc.status === "in_progress") redirect(`/workout/${sessionId}`);
  if (doc.status === "discarded") notFound();
  return <SessionView doc={doc} timeZone={await viewerTimeZone()} justFinished={finished === "1"} />;
}
