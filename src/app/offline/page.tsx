import type { Metadata } from "next";
import { OfflineWorkout } from "@/components/logger/OfflineWorkout";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };
export const dynamic = "force-static";

/** Static shell (no user data in the HTML) served by the service worker when offline. */
export default function OfflinePage() {
  return <OfflineWorkout />;
}
