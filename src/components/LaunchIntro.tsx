"use client";

import { useEffect } from "react";

/** Once the page is ready: hand over from the native splash, play the intro, then get out of the way. */
export function LaunchIntro() {
  useEffect(() => {
    const el = document.getElementById("launch-intro");
    if (!el || el.hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    let cancelled = false;
    // Wait for the typeface (at most half a second) so the dot's starting point is measured right.
    void Promise.race([document.fonts.ready, new Promise((r) => window.setTimeout(r, 500))]).then(() => {
      if (cancelled) return;
      // Start the dot in the middle of the screen, where the splash shows it.
      const dot = el.querySelector<HTMLElement>(".sm-intro-dot");
      if (dot) {
        const r = dot.getBoundingClientRect();
        dot.style.setProperty("--sm-intro-dx", `${window.innerWidth / 2 - (r.left + r.width / 2)}px`);
      }
      void import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 150 })).catch(() => undefined);
      el.classList.add("is-playing");
      timers.push(window.setTimeout(() => el.classList.add("is-leaving"), reduce ? 150 : 1150));
      timers.push(window.setTimeout(() => (el.hidden = true), reduce ? 450 : 1530));
    });
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
  return null;
}

/** An inline script that runs while the HTML is parsed, without React's dev warning on hydration. */
export function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
