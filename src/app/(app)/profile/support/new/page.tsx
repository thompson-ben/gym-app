import type { Metadata } from "next";
import { NewSupportMessage } from "@/components/support/NewSupportMessage";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Message us" };

export default async function NewSupportPage() {
  await requireUser();
  return (
    <>
      <PageHeader back={{ href: "/profile/support", label: "Help & support" }} title="Message us" />
      <p className="-mt-2 mb-6 text-muted">Tell us what’s up. The more detail, the quicker we can help.</p>
      <NewSupportMessage />
    </>
  );
}
