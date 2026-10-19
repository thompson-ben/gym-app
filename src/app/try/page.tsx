import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DemoWorkout } from "@/components/demo/DemoWorkout";
import { getOptionalUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Try a workout",
  description: "Log a workout in NotchLift right now, no account needed: last time beside every set, and a nudge when it’s time to go heavier.",
  alternates: { canonical: "/try" },
};

/** "Try a workout": the logger on example data, before any account exists. */
export default async function TryPage() {
  const { supabase, userId } = await getOptionalUser();
  if (userId) redirect("/train");
  const { data: paidPlans } = await supabase.rpc("paid_plans_live");
  return <DemoWorkout cta={paidPlans === true ? "Start free trial" : "Start free"} />;
}
