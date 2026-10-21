import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThreadView } from "@/components/support/ThreadView";
import { PageHeader } from "@/components/ui";
import { STATUS_LABEL, topicLabel, type SupportThread } from "@/lib/support";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Help & support" };

export default async function SupportThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<{ sent?: string }> }) {
  const [{ threadId }, { sent }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  // Opening the conversation marks any reply as read.
  const { data } = await supabase.rpc("support_open_thread", { p_thread: threadId });
  if (!data) notFound();
  const thread = data as SupportThread;
  return (
    <>
      <PageHeader back={{ href: "/profile/support", label: "Help & support" }} eyebrow={`${topicLabel(thread.topic)} · ${STATUS_LABEL[thread.status]}`} title={thread.subject} />
      {sent ? (
        <p role="status" className="mb-5 rounded-2xl bg-accent-soft px-4 py-3 text-sm">
          Thanks, your message has been sent. We’ll email you when we reply (check your junk folder if you don’t see it).
        </p>
      ) : null}
      <ThreadView thread={thread} />
    </>
  );
}
