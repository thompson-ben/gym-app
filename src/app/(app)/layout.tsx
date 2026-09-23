import { BottomNav } from "@/components/BottomNav";
import { ClientBoot } from "@/components/ClientBoot";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await requireUser();
  return (
    <>
      <ClientBoot userId={userId} />
      <main className="page-bottom mx-auto w-full max-w-2xl px-4 sm:px-6">{children}</main>
      <BottomNav />
    </>
  );
}
