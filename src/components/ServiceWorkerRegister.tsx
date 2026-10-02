"use client";

import { useEffect } from "react";

/** Registers the service worker for this build and checks for a newer one when the app is reopened. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const version = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev");
    let registration: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register(`/sw.js?v=${version}`, { scope: "/" })
      .then((r) => {
        registration = r;
      })
      .catch(() => undefined);
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
