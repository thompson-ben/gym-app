import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/styles";
import { Wordmark } from "@/components/Wordmark";
import { getOptionalUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const { userId } = await getOptionalUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="pt-10 pb-8">
        <Wordmark />
      </div>
      {userId ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Reset link expired</h1>
          <p className="text-muted">Open the latest reset link from your email, or request a new one. Links work once and for one hour.</p>
          <Link href="/forgot-password" className={buttonClass("primary", "lg", "w-full")}>Request a new link</Link>
        </div>
      )}
    </main>
  );
}
