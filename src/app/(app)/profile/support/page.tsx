import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronDown, IconChevronRight } from "@/components/icons";
import { buttonClass, cx } from "@/components/styles";
import { PageHeader, SectionTitle } from "@/components/ui";
import { CONTACT_EMAIL } from "@/lib/company";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL, SUPPORT_FAQ, hasUnread, type SupportThread } from "@/lib/support";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Help & support" };

export default async function SupportPage() {
  const { supabase } = await requireUser();
  // Missing before migration 30: the messages section is hidden and email is offered instead.
  const { data, error } = await supabase
    .from("support_threads")
    .select("id, topic, subject, status, created_at, last_user_at, last_support_at, user_seen_at")
    .order("last_user_at", { ascending: false })
    .limit(50);
  const threads = (data ?? []) as Omit<SupportThread, "messages">[];
  const ready = !error;

  return (
    <>
      <PageHeader back={{ href: "/profile", label: "Profile" }} title="Help & support" />

      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="sr-only">Common questions</h2>
        <div className="space-y-6">
          {SUPPORT_FAQ.map((g) => (
            <div key={g.title}>
              <SectionTitle>{g.title}</SectionTitle>
              <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {g.items.map((f) => (
                  <details key={f.q} className="group">
                    <summary className="flex min-h-13 cursor-pointer list-none items-center gap-3 px-4 py-3 font-medium hover:bg-surface-2/50 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">{f.q}</span>
                      <IconChevronDown className="shrink-0 text-faint transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-4 pb-4 leading-relaxed text-muted">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="messages-title">
        <h2 id="messages-title" className="text-xl font-semibold tracking-tight">Still need help?</h2>
        {ready ? (
          <>
            <p className="mt-1 text-muted">Send us a message. We usually reply within a day, and you’ll get an email when we do.</p>
            <Link href="/profile/support/new" className={buttonClass("primary", "lg", "mt-4 w-full")}>Message us</Link>
            {threads.length ? (
              <div className="mt-8">
                <SectionTitle>Your messages</SectionTitle>
                <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                  {threads.map((t) => {
                    const unread = hasUnread(t);
                    return (
                      <li key={t.id}>
                        <Link href={`/profile/support/${t.id}`} className="flex min-h-13 items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                          <span className="min-w-0 flex-1">
                            <span className={cx("block truncate", unread ? "font-semibold" : "font-medium")}>{t.subject}</span>
                            <span className="block text-sm text-muted">
                              {unread ? <span className="font-medium text-accent-text">New reply</span> : STATUS_LABEL[t.status]} · <span suppressHydrationWarning>{formatDate(t.last_support_at && t.last_support_at > t.last_user_at ? t.last_support_at : t.last_user_at)}</span>
                            </span>
                          </span>
                          {unread ? <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" /> : null}
                          <IconChevronRight className="shrink-0 text-faint" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-muted">
            Email us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent-text underline underline-offset-4">{CONTACT_EMAIL}</a> and we’ll get back to you.
          </p>
        )}
      </section>
    </>
  );
}
