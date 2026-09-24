import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string }> }) {
  const { email, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="pt-10 pb-8">
        <Link href="/sign-in"><Wordmark /></Link>
      </div>
      <ForgotPasswordForm initialEmail={email ?? ""} linkInvalid={error === "link_invalid"} />
    </main>
  );
}
