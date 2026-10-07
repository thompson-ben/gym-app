import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/styles";
import { JoinGroupForm } from "@/components/together/JoinGroupForm";
import { Wordmark } from "@/components/Wordmark";
import { formatDate, formatTarget, formatTime } from "@/lib/format";
import { isInviteToken, type GroupInvitePreview } from "@/lib/group";
import { getOptionalUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Join a group workout",
  description: "You’ve been invited to train together on NotchLift.",
  robots: { index: false, follow: false },
};

/** Invite link for a group workout. Shows the plan to anyone; joining needs an account. */
export default async function JoinGroupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, userId } = await getOptionalUser();
  const { data } = isInviteToken(token) ? await supabase.rpc("group_invite_preview", { p_token: token }) : { data: null };
  const invite = data as GroupInvitePreview | null;
  // Already in the group: go straight to it.
  if (invite?.group_id) redirect(`/together/${invite.group_id}`);
  const tz = await viewerTimeZone();
  const here = `/join/${token}`;

  let defaultName = "";
  if (userId && invite) {
    const { data: profile } = await supabase.from("profiles").select("display_name").maybeSingle();
    defaultName = profile?.display_name ?? "";
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pt-safe pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">
      <div className="flex h-14 items-center">
        <Link href="/"><Wordmark size="sm" /></Link>
      </div>
      {!invite ? (
        <div className="pt-10">
          <h1 className="text-2xl font-semibold">This invite isn’t available</h1>
          <p className="mt-2 text-muted">The group workout may have been deleted, or the link was mistyped. Ask whoever sent it for a new link.</p>
          <Link href="/train" className={buttonClass("secondary", "lg", "mt-6")}>Go to NotchLift</Link>
        </div>
      ) : (
        <>
          <header className="pt-4 pb-5">
            <p className="text-xs font-medium tracking-[0.14em] text-accent-text uppercase">Group workout</p>
            <h1 className="mt-1.5 text-[32px] leading-tight font-semibold tracking-tight break-words">{invite.name}</h1>
            <p className="mt-2 text-muted">
              {invite.host_name ?? "A friend"} invited you to train together
              {invite.planned_for ? ` on ${formatDate(invite.planned_for, tz, { weekday: "long", year: undefined })} at ${formatTime(invite.planned_for, tz)}` : ""}.
              {invite.member_count > 1 ? ` ${invite.member_count} people have joined.` : ""}
            </p>
          </header>

          {invite.exercises.length ? (
            <ol className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {invite.exercises.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 font-medium">{e.name}</span>
                  <span className="shrink-0 text-sm text-muted tabular">{formatTarget(e.target_sets, e.rep_min, e.rep_max)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-muted">The plan is still being put together.</p>
          )}
          <p className="mt-3 text-sm text-faint">Everyone logs their own sets on their own phone. Partners see who has started and finished, never your weights or reps.</p>

          <div className="mt-6">
            {userId ? (
              <JoinGroupForm token={token} defaultName={defaultName} />
            ) : (
              <div className="space-y-3 rounded-3xl border border-line bg-surface p-5">
                <p className="font-medium">Join with a free NotchLift account</p>
                <p className="text-sm text-muted">Plan your training, log every set, and see your progress. It takes under a minute.</p>
                <Link href={`/sign-in?mode=sign-up&next=${encodeURIComponent(here)}`} className={buttonClass("primary", "lg", "w-full")}>Create account and join</Link>
                <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className={buttonClass("ghost", "md", "w-full")}>I already have an account</Link>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
