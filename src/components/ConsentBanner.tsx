"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isPublicPath } from "@/lib/attribution";
import { shouldAsk } from "@/lib/consent";
import { PIXEL_ID, pixelEvent, readConsent, saveConsent } from "@/lib/pixel";
import { trackDetail, trackingAllowed } from "@/lib/track";
import { buttonClass } from "./styles";

/**
 * Asks once (on public pages) whether Meta may measure our ads. Accepting loads the Meta Pixel;
 * declining, or a browser privacy signal, means it never loads. The app itself is never tracked
 * by Meta: only page views on public pages, sign-ups and purchases are reported.
 */
export function ConsentBanner() {
  const pathname = usePathname() ?? "/";
  const publicPage = isPublicPath(pathname);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    const update = () => setAsk(shouldAsk({ pixelId: PIXEL_ID, consent: readConsent(), optOutSignal: !trackingAllowed(), publicPage }));
    update();
    window.addEventListener("nl-consent", update);
    return () => window.removeEventListener("nl-consent", update);
  }, [publicPage]);

  useEffect(() => {
    if (publicPage) pixelEvent("PageView");
  }, [pathname, publicPage]);

  if (!ask) return null;
  const choose = (granted: boolean) => {
    saveConsent(granted ? "granted" : "denied");
    // Anonymous count of the choice (not stored with anything about this browser).
    trackDetail("consent", granted ? "accepted" : "declined");
    if (granted) pixelEvent("PageView");
  };
  return (
    <div role="dialog" aria-label="Cookie choice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-3xl border border-line bg-surface p-4 shadow-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <p className="text-sm leading-relaxed text-muted">
        Can we use a cookie from Meta to see which of our ads bring people to NotchLift? It counts visits, sign-ups and purchases, never what you do in the app.{" "}
        <Link href="/privacy#cookies" className="text-accent-text underline underline-offset-4">Privacy</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose(false)} className={buttonClass("secondary", "md", "flex-1")}>No thanks</button>
        <button type="button" onClick={() => choose(true)} className={buttonClass("primary", "md", "flex-1")}>Accept</button>
      </div>
    </div>
  );
}

/** Reopens the banner from the privacy page. */
export function CookieChoiceButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void import("@/lib/pixel").then((m) => m.resetConsent());
        window.scrollTo({ top: 0 });
      }}
      className="text-accent-text underline underline-offset-4"
    >
      Change your cookie choice
    </button>
  );
}
