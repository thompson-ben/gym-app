import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { buttonClass } from "@/components/styles";
import { billingSecret } from "@/lib/billing/server";
import { verifyUnsubscribe } from "@/lib/emails/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/** Opened from the link in a reminder email. Asks first, so email link scanners can't unsubscribe anyone. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string; error?: string }> }) {
  const { u, t, done, error } = await searchParams;
  const valid = verifyUnsubscribe(u, t, billingSecret());
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="pt-10 pb-8">
        <Wordmark />
      </div>
      {done ? (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">You’re unsubscribed</h1>
          <p className="text-muted">
            We won’t send you reminder emails any more. You’ll still get emails you ask for, like password resets. You can turn reminders back on
            any time in Profile.
          </p>
          <Link href="/profile" className={buttonClass("secondary", "lg")}>Go to Profile</Link>
        </section>
      ) : error || !valid ? (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">That link didn’t work</h1>
          <p className="text-muted">
            It may be incomplete. Sign in and switch off <span className="text-fg">Reminder emails</span> in Profile instead, or reply to any of
            our emails and we’ll do it for you.
          </p>
          <Link href="/profile" className={buttonClass("secondary", "lg")}>Go to Profile</Link>
        </section>
      ) : (
        <form method="post" action="/api/unsubscribe" className="space-y-4">
          <h1 className="text-2xl font-semibold">Stop reminder emails?</h1>
          <p className="text-muted">
            These are the occasional emails about getting started and your free trial. You’ll still get emails you ask for, like password resets.
          </p>
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          <button type="submit" className={buttonClass("primary", "lg", "w-full")}>Unsubscribe</button>
        </form>
      )}
    </main>
  );
}
