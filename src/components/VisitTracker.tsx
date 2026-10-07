"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isPublicPath } from "@/lib/attribution";
import { trackPageView } from "@/lib/track";

/** Anonymous visit counting and campaign attribution on public pages (see lib/attribution). */
export function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && isPublicPath(pathname)) trackPageView();
  }, [pathname]);
  return null;
}
