import { BottomNav } from "@/components/BottomNav";
import { ClientBoot } from "@/components/ClientBoot";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await requireUser();
  return (
    <>
      <ClientBoot userId={userId} />
      {/* Opaque strip behind the status bar (standalone iOS draws content under it). */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-bg" />
      <main className="page-bottom mx-auto w-full max-w-2xl px-4 sm:px-6">{children}</main>
      <BottomNav />
    </>
  );
}
