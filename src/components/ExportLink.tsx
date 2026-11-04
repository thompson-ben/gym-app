"use client";

import { useState } from "react";
import { isNativeApp } from "@/lib/native";
import { reportClientError } from "@/lib/monitoring";
import { shareDownload } from "@/lib/native-files";

/**
 * A download link for the data export. In a browser it's a plain download; in the iOS app,
 * where the web view can't download, it fetches the file and opens the share sheet instead.
 */
export function ExportLink({ href, fallbackName, className, children }: { href: string; fallbackName: string; className?: string; children: React.ReactNode }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isNativeApp()) return;
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      await shareDownload(href, fallbackName);
      setState("idle");
    } catch (error) {
      reportClientError(error);
      setState("error");
    }
  }
  // In a row (flex-wrap), basis-full puts the message on its own line under the text.
  return (
    <a href={href} download onClick={onClick} aria-busy={state === "busy" || undefined} className={className}>
      {children}
      {state === "error" ? <span role="alert" className="block basis-full text-sm text-danger">Couldn’t export just now. Please try again.</span> : null}
    </a>
  );
}
