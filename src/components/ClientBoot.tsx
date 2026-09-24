"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { pruneOtherUsers, setLastUser } from "@/lib/session/store";

/**
 * Remembers the signed-in user for the offline workout shell and shares the browser's time
 * zone with the server so dates render in the user's own zone.
 */
export function ClientBoot({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    pruneOtherUsers(window.localStorage, userId);
    setLastUser(window.localStorage, userId);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.match(/(?:^|; )sm_tz=([^;]*)/)?.[1];
    if (tz && decodeURIComponent(current ?? "") !== tz) {
      document.cookie = `sm_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [userId, router]);
  return null;
}
