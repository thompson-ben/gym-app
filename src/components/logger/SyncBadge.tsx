"use client";

import type { SyncStatus } from "@/lib/session/sync";
import { IconAlert, IconCheck, IconCloudOff } from "../icons";
import { cx } from "../styles";
import { Spinner } from "../ui";

/** Always tells the truth about where the data is: never "Saved" unless the server has it. */
export function SyncBadge({ status, onRetry, signInHref }: { status: SyncStatus; onRetry?: () => void; signInHref?: string }) {
  const base = "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px]";
  switch (status.kind) {
    case "saved":
      return (
        <span role="status" className={cx(base, "text-muted")}>
          <IconCheck size={14} className="text-accent-text" /> Saved
        </span>
      );
    case "pending":
    case "saving":
      return (
        <span role="status" className={cx(base, "text-muted")}>
          <Spinner className="h-3 w-3" /> Saving
        </span>
      );
    case "offline":
      return (
        <span role="status" className={cx(base, "border-warn/40 text-warn")} title="Stored on this device. It will sync when you're back online.">
          <IconCloudOff size={14} /> Offline · on this device
        </span>
      );
    case "conflict":
      return (
        <span role="status" className={cx(base, "border-danger/40 bg-danger-soft text-danger")}>
          <IconAlert size={14} /> Needs review
        </span>
      );
    case "signed_out":
      return (
        <a href={signInHref ?? "/sign-in"} className={cx(base, "border-warn/40 text-warn")} title="Your sets are kept on this device and sync after you sign in.">
          <IconAlert size={14} /> Sign in to sync
        </a>
      );
    case "closed":
      return (
        <span role="status" className={cx(base, "text-muted")}>
          Closed
        </span>
      );
    case "error":
      return (
        <button type="button" onClick={onRetry} className={cx(base, "border-danger/40 bg-danger-soft text-danger")} title={status.message}>
          <IconAlert size={14} /> Sync failed · Retry
        </button>
      );
  }
}
