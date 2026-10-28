import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";
import { PageHeader } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { MEMBERSHIP_COLUMNS, type MembershipRow } from "@/lib/billing/membership";
import { isNativeRequest } from "@/lib/native-server";
import type { ReferralStatus } from "@/lib/referral";
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
  const [{ data: membership }, { data: isAdmin }, { data: emailPrefs }, days, unread] = await Promise.all([
    supabase.from("memberships").select(MEMBERSHIP_COLUMNS).eq("user_id", userId).maybeSingle(),
    // Missing before migration 13: then nobody is an admin.
    supabase.rpc("is_admin"),
    // Missing before migration 25: the switch is hidden.
    supabase.from("profiles").select("reminder_emails").eq("id", userId).maybeSingle(),
    // Missing before migration 26: the row is hidden.
    supabase.from("profiles").select("training_days").eq("id", userId).maybeSingle(),
    // Missing before migration 30: Help & support still opens, without messages.
    supabase.rpc("support_unread"),
  ]);
  const trainingDays = days.error || !days.data ? undefined : ((days.data as { training_days: number[] | null }).training_days ?? null);
  // Trial members can invite a friend for more days (migration 18; missing before it: hidden).
  let referral: ReferralStatus | null = null;
  if ((membership as MembershipRow)?.status === "trial") {
    await supabase.rpc("my_referral_code");
    const { data: status } = await supabase.rpc("my_referral_status");
    referral = (status as ReferralStatus | null) ?? null;
  }
  let support: { unread: number; adminOpen: number | null } | undefined;
  if (!unread.error) {
    let adminOpen: number | null = null;
    if (isAdmin === true) {
      const { data: inbox } = await supabase.rpc("admin_support_threads", { p_status: "open" });
      adminOpen = (inbox as { counts?: { open: number } } | null)?.counts?.open ?? null;
    }
    support = { unread: (unread.data as number | null) ?? 0, adminOpen };
  }
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
      <ProfileForm userId={userId} email={email} profile={data ?? defaults} membership={(membership as MembershipRow) ?? null} referral={referral} isAdmin={isAdmin === true} reminderEmails={(emailPrefs as { reminder_emails?: boolean } | null)?.reminder_emails ?? null} trainingDays={trainingDays} support={support} native={await isNativeRequest()} />
      <div className="mt-12 text-center">
        <Wordmark size="sm" className="text-muted" />
        <p className="text-xs text-faint">Workout Planner &amp; Tracker</p>
      </div>
    </>
  );
}
