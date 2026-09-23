"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { remainingSeconds, type RestTimer as Timer } from "@/lib/timer";
import { cx } from "../styles";
import { Button } from "../ui";

/** Re-renders every 250 ms and whenever the page becomes visible again. Time comes from timestamps. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [active]);
  return now;
}

export function RestTimerBar({
  timer,
  onStop,
  onAdjust,
  onRestart,
}: {
  timer: NonNullable<Timer>;
  onStop: () => void;
  onAdjust: (delta: number) => void;
  onRestart: () => void;
}) {
  const now = useNow(true);
  const remaining = remainingSeconds(timer, now) ?? 0;
  const finished = remaining <= 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (finished && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([120, 80, 120]);
    }
    if (!finished) buzzed.current = false;
  }, [finished]);
  const progress = Math.min(1, Math.max(0, 1 - remaining / timer.duration));

  return (
    <div className={cx("rounded-3xl border p-3", finished ? "border-accent bg-accent-soft" : "border-line bg-surface")} role="timer" aria-live="off">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{finished ? "Rest done" : "Rest"}</p>
          <p className={cx("text-3xl leading-tight font-semibold tabular", finished && "text-accent-text")} aria-label={`${Math.ceil(remaining)} seconds remaining`}>
            {formatDuration(Math.ceil(remaining))}
          </p>
        </div>
        {finished ? (
          <>
            <Button size="md" variant="secondary" onClick={onRestart}>Restart</Button>
            <Button size="md" variant="primary" onClick={onStop}>Dismiss</Button>
          </>
        ) : (
          <>
            <Button size="md" variant="secondary" onClick={() => onAdjust(-15)} aria-label="Remove 15 seconds">−15</Button>
            <Button size="md" variant="secondary" onClick={() => onAdjust(15)} aria-label="Add 15 seconds">+15</Button>
            <Button size="md" variant="ghost" onClick={onStop}>Stop</Button>
          </>
        )}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
