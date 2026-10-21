import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThreadView } from "@/components/support/ThreadView";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ADMIN_STATUS_LABEL, topicLabel, type AdminSupportThread } from "@/lib/support";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Support", robots: { index: false, follow: false } };

export default async function AdminSupportThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("admin_support_thread", { p_thread: threadId });
  if (error || !data) notFound();
  const t = data as AdminSupportThread;
  const facts: [string, string | null][] = [
    ["From", t.display_name ? `${t.display_name} · ${t.email}` : t.email],
    ["Joined", formatDate(t.joined_at)],
    ["Membership", t.membership],
    ["Last screen", t.page],
    ["App version", t.app_version],
    ["Device", t.user_agent],
  ];
  return (
    <>
      <PageHeader back={{ href: "/admin/support", label: "Support" }} eyebrow={`${topicLabel(t.topic)} · ${ADMIN_STATUS_LABEL[t.status]}`} title={t.subject} />
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-3xl border border-line bg-surface p-4 text-sm">
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <ThreadView thread={t} admin />
    </>
  );
}
