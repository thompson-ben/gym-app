"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, cx } from "./ui";

/** Not under "splitmate:v1:" (reserved for per-account workout data). */
const PREFIX = "splitmate-tip:";
const ALL_TIPS = ["train", "workout", "splits", "progress"] as const;
export type TipId = (typeof ALL_TIPS)[number];

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function seen(id: TipId): boolean {
  try {
    return window.localStorage.getItem(PREFIX + id) === "1";
  } catch {
    return true; // no storage: never nag
  }
}

/** Shows every tip again (Profile → App → Show tips again). */
export function resetTips() {
  try {
    for (const id of ALL_TIPS) window.localStorage.removeItem(PREFIX + id);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/**
 * A one-time tip explaining the key points of a screen, shown the first time it is opened on
 * this device and gone for good after "Got it".
 */
export function PageTip({ id, title, children, className }: { id: TipId; title: string; children: ReactNode; className?: string }) {
  const isSeen = useSyncExternalStore(subscribe, () => seen(id), () => true);
  const [closing, setClosing] = useState(false);
  if (isSeen || closing) return null;
  return (
    <aside aria-label={`Tip: ${title}`} className={cx("rounded-2xl border border-line bg-surface-2 px-4 py-3", className)}>
      <p className="text-xs font-semibold tracking-[0.14em] text-accent-text uppercase">Tip</p>
      <p className="mt-1 font-medium">{title}</p>
      <div className="mt-1 space-y-1 text-sm text-muted">{children}</div>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={() => {
          try {
            window.localStorage.setItem(PREFIX + id, "1");
          } catch {
            /* storage unavailable */
          }
          setClosing(true);
          listeners.forEach((l) => l());
        }}
      >
        Got it
      </Button>
    </aside>
  );
}

export function ShowTipsAgainRow() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        resetTips();
        setDone(true);
      }}
      className="flex min-h-13 w-full flex-col items-start justify-center px-4 py-3 text-left hover:bg-surface-2/50"
    >
      <span className="font-medium">Show tips again</span>
      <span className="text-sm text-muted">{done ? "Done. Tips will appear on each screen again." : "Brings back the one-time tips on each screen."}</span>
    </button>
  );
}
