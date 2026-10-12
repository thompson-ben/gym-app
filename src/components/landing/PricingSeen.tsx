"use client";

import { useEffect, useRef } from "react";
import { trackPricingView } from "@/lib/track";

/** Invisible marker at the top of the pricing section: records "saw pricing" once it scrolls into view. */
export function PricingSeen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        trackPricingView();
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} aria-hidden="true" className="h-px" />;
}
