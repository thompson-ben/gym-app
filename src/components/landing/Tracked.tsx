"use client";

import Link from "next/link";
import { useEffect, type ComponentProps } from "react";
import { trackDetail } from "@/lib/track";

/** A link that records which button it was (anonymous, once per tab session). */
export function TrackedLink({ track, onClick, ...props }: ComponentProps<typeof Link> & { track: string }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        trackDetail("cta_click", track);
        onClick?.(e);
      }}
    />
  );
}

const DEPTHS: [number, string][] = [
  [0.25, "quarter"],
  [0.5, "half"],
  [0.75, "three_quarters"],
  [0.95, "bottom"],
];

/** Records how far down this page someone scrolls: a quarter, half, three quarters, the bottom. */
export function ScrollDepth() {
  useEffect(() => {
    const check = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const seen = window.scrollY / max;
      for (const [at, name] of DEPTHS) if (seen >= at) trackDetail("scroll_depth", name);
    };
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return null;
}
