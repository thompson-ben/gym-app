import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";
import { PageHeader } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, userId, email } = await requireUser();
  const columns = "display_name, default_rest_seconds, auto_start_rest, weight_unit";
  const defaults = { display_name: null, default_rest_seconds: 120, auto_start_rest: false, weight_unit: "kg" };
  let { data } = await supabase.from("profiles").select(columns).eq("id", userId).maybeSingle();
  if (!data) {
    // Accounts created before the database was set up have no profile row yet: create it.
    ({ data } = await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id" }).select(columns).maybeSingle());
  }
  // Membership is read-only for users; a missing table (before migration 9) just hides the badge.
  const [{ data: membership }, { data: isAdmin }] = await Promise.all([
    supabase.from("memberships").select("status, trial_ends_at").eq("user_id", userId).maybeSingle(),
    // Missing before migration 13: then nobody is an admin.
    supabase.rpc("is_admin"),
  ]);
  // Never block the page on profile settings; they only affect defaults.
  const unavailable = !data;
  return (
    <>
      <PageHeader title="Profile" />
      {unavailable ? (
        <p role="status" className="mb-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Your profile settings could not be loaded, so defaults are shown. Your splits and workouts are not affected.
        </p>
      ) : null}
      <ProfileForm userId={userId} email={email} profile={data ?? defaults} membership={membership ?? null} isAdmin={isAdmin === true} />
      <div className="mt-12 text-center">
        <Wordmark size="sm" className="text-muted" />
        <p className="text-xs text-faint">Workout Planner &amp; Tracker</p>
      </div>
    </>
  );
}
