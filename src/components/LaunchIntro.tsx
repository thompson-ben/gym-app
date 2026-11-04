"use client";

import { useEffect } from "react";

/** Once the page is ready: hand over from the native splash, play the intro, then get out of the way. */
export function LaunchIntro() {
  useEffect(() => {
    const el = document.getElementById("launch-intro");
    if (!el || el.hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The overlay matches the splash exactly, so a short cross-fade hides the switch.
    void import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 })).catch(() => undefined);
    el.classList.add("is-playing");
    const leave = window.setTimeout(() => el.classList.add("is-leaving"), reduce ? 150 : 950);
    const done = window.setTimeout(() => (el.hidden = true), reduce ? 450 : 1250);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);
  return null;
}

/** An inline script that runs while the HTML is parsed, without React's dev warning on hydration. */
export function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
