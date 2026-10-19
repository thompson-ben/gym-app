import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdLanding } from "@/components/landing/AdLanding";
import { getOptionalUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "NotchLift · The workout tracker that tells you when to add weight" },
  description: "Plan your split, log every set in seconds and see last session beside every set. Try a workout now, no sign-up.",
  // The ad's landing page; search engines should show the main page instead.
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default async function AddWeightPage() {
  const { supabase, userId } = await getOptionalUser();
  if (userId) redirect("/train");
  const { data: paidPlans } = await supabase.rpc("paid_plans_live");
  return <AdLanding paidPlans={paidPlans === true} />;
}
