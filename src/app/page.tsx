import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { getOptionalUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "NotchLift · Workout planner & tracker" },
  description:
    "Plan your split, log every set with last session beside it, and know when to add weight. Works offline, in kg or lb. Free during early access.",
  alternates: { canonical: "/" },
};

export default async function Home() {
  const { supabase, userId } = await getOptionalUser();
  if (userId) redirect("/train");
  // Before migration 14 the function is missing: show free early access.
  const { data: paidPlans } = await supabase.rpc("paid_plans_live");
  return <Landing paidPlans={paidPlans === true} />;
}
