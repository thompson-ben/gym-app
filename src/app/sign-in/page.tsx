import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { getOptionalUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { AuthForm } from "./AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const { userId } = await getOptionalUser();
  if (userId) redirect(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="pt-10 pb-8">
        <Wordmark />
        <p className="mt-1 text-sm text-muted">Workout Planner &amp; Tracker</p>
      </div>
      {params.deleted === "1" ? (
        <p role="status" className="mb-6 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Your account and all its data have been deleted.
        </p>
      ) : null}
      <AuthForm initialMode={params.mode === "sign-up" ? "sign-up" : "sign-in"} next={next} error={params.error ?? null} initialEmail={params.email && params.email.length <= 254 && params.email.includes("@") ? params.email : ""} />
    </main>
  );
}
