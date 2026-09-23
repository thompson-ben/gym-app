import type { Metadata } from "next";
import Link from "next/link";
import { CopySharedSplit } from "@/components/CopySharedSplit";
import { SharedSplitView, type SharedSnapshot } from "@/components/SharedSplitView";
import { buttonClass } from "@/components/styles";
import { Wordmark } from "@/components/Wordmark";
import { formatDate } from "@/lib/format";
import { getOptionalUser, viewerTimeZone } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shared split", robots: { index: false, follow: false } };

type Shared = { name: string; description: string | null; include_notes: boolean; snapshot_at: string; snapshot: SharedSnapshot };

export default async function SharedSplitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, userId } = await getOptionalUser();
  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);
  const { data } = valid ? await supabase.rpc("get_shared_split", { p_token: token }) : { data: null };
  const shared = data as Shared | null;
  const tz = await viewerTimeZone();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-safe pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">
      <div className="flex h-14 items-center">
        <Link href="/"><Wordmark size="sm" /></Link>
      </div>
      {!shared ? (
        <div className="pt-10">
          <h1 className="text-2xl font-semibold">This link is not available</h1>
          <p className="mt-2 text-muted">The share link may have been revoked or mistyped. Ask the person who shared it for a new link.</p>
        </div>
      ) : (
        <>
          <header className="pt-4 pb-5">
            <p className="text-sm text-muted">Shared split · snapshot from {formatDate(shared.snapshot_at, tz)}</p>
            <h1 className="text-[32px] leading-tight font-semibold tracking-tight">{shared.name}</h1>
            {shared.description ? <p className="mt-2 text-muted">{shared.description}</p> : null}
          </header>
          <p className="mb-4 text-sm text-faint">
            Includes workouts, exercises and targets{shared.include_notes ? ", plus the sharer’s exercise notes" : ""}. No one’s training history is shared.
          </p>
          <SharedSplitView snapshot={shared.snapshot} />
          <div className="mt-6">
            {userId ? (
              <CopySharedSplit token={token} snapshot={shared.snapshot} />
            ) : (
              <div className="space-y-3 rounded-3xl border border-line bg-surface p-5">
                <p className="font-medium">Copy this split to your account</p>
                <p className="text-sm text-muted">Your copy is yours to edit. Previous performance comes from your own history.</p>
                <Link href={`/sign-in?next=${encodeURIComponent(`/s/${token}`)}`} className={buttonClass("primary", "lg", "w-full")}>Sign in to copy</Link>
                <Link href={`/sign-in?mode=sign-up&next=${encodeURIComponent(`/s/${token}`)}`} className={buttonClass("ghost", "md", "w-full")}>Create an account</Link>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
