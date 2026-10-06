import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "../Wordmark";

export const LEGAL_UPDATED = "3 October 2026";

/** Where people can reach the operator. Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel. */
export function contactLine(): ReactNode {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return email ? (
    <a href={`mailto:${email}`} className="text-accent-text underline underline-offset-4">{email}</a>
  ) : (
    "the person who invited you to NotchLift"
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 pt-safe pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between pt-10 pb-8">
        <Link href="/"><Wordmark /></Link>
        <nav className="flex gap-4 text-sm text-muted">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
        </nav>
      </div>
      <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-sm text-faint">Last updated {LEGAL_UPDATED}</p>
      <div className="legal mt-8 space-y-6 text-[15px] leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-fg [&_ul]:space-y-1">
        {children}
      </div>
    </main>
  );
}
