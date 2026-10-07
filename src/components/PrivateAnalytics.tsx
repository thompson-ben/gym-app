"use client";

import { Analytics } from "@vercel/analytics/next";
import { scrubUrl } from "@/lib/monitoring";

/**
 * Vercel Web Analytics: anonymous page views, no cookies. Secret tokens in URLs (invite and
 * share links, email links) are blanked before a page view is recorded. Only active on Vercel
 * once Analytics is enabled for the project.
 */
export function PrivateAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })} />;
}
