import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronRight } from "@/components/icons";
import { cx } from "@/components/styles";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ADMIN_STATUS_LABEL, topicLabel, type AdminSupportList, type SupportStatus } from "@/lib/support";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Support", robots: { index: false, follow: false } };

const TABS: SupportStatus[] = ["open", "answered", "closed"];

/** Admins: support conversations by status. Shows email addresses: admin only. */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const status = TABS.find((s) => s === params.status) ?? "open";
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("admin_support_threads", { p_status: status });
  if (error || !data) notFound();
  const list = data as AdminSupportList;

  return (
    <>
      <PageHeader back={{ href: "/admin", label: "Admin" }} title="Support" />
      <nav aria-label="Status" className="mb-5 flex gap-2">
        {TABS.map((s) => (
          <Link
            key={s}
            href={s === "open" ? "/admin/support" : `/admin/support?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cx("flex h-11 flex-1 items-center justify-center rounded-xl border px-2 text-sm", s === status ? "border-accent-text bg-accent-soft font-medium text-fg" : "border-line text-muted")}
          >
            {ADMIN_STATUS_LABEL[s]} · {list.counts[s]}
          </Link>
        ))}
      </nav>
      {list.threads.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {list.threads.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.subject}</span>
                  <span className="block truncate text-sm text-muted">{t.display_name ? `${t.display_name} · ` : ""}{t.email}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-faint">{t.preview}</span>
                  <span className="mt-1 block text-xs text-faint">{topicLabel(t.topic)} · {t.messages} {t.messages === 1 ? "message" : "messages"} · <span suppressHydrationWarning>{formatDateTime(t.last_at)}</span></span>
                </span>
                <IconChevronRight className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={status === "open" ? "Nothing waiting for a reply" : `No ${ADMIN_STATUS_LABEL[status].toLowerCase()} conversations`}>
          {status === "open" ? "New messages from Profile → Help & support appear here, and you’ll get an email for each one." : null}
        </EmptyState>
      )}
    </>
  );
}
