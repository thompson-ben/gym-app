import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";
import { PageHeader } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, userId, email } = await requireUser();
  const { data, error } = await supabase.from("profiles").select("display_name, default_rest_seconds, auto_start_rest, weight_unit").eq("id", userId).single();
  if (error) throw error;
  return (
    <>
      <PageHeader title="Profile" />
      <ProfileForm userId={userId} email={email} profile={data} />
      <div className="mt-12 text-center">
        <Wordmark size="sm" className="text-muted" />
        <p className="text-xs text-faint">Workout Planner &amp; Tracker</p>
      </div>
    </>
  );
}
