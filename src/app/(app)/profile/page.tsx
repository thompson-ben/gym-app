import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";
import { PageHeader } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, userId, email } = await requireUser();
  const columns = "display_name, default_rest_seconds, auto_start_rest, weight_unit";
  let { data, error } = await supabase.from("profiles").select(columns).eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) {
    // Accounts created before the database was set up have no profile row yet: create it.
    ({ data, error } = await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id" }).select(columns).single());
    if (error) throw error;
  }
  return (
    <>
      <PageHeader title="Profile" />
      <ProfileForm userId={userId} email={email} profile={data!} />
      <div className="mt-12 text-center">
        <Wordmark size="sm" className="text-muted" />
        <p className="text-xs text-faint">Workout Planner &amp; Tracker</p>
      </div>
    </>
  );
}
