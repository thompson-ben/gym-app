"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { heldSeconds, holdPhase, startHold, type HoldTimer as Timer } from "@/lib/hold-timer";
import { cx } from "../styles";
import { Button } from "../ui";
import { useNow } from "./RestTimer";

/**
 * Stopwatch for a timed exercise: Start, a 3-second count-in, then it counts the hold. Stop puts
 * the seconds into the next set to do, ready to confirm (nothing counts until it's confirmed).
 * Buzzes when the hold starts and when it reaches the top of the target range.
 */
export function HoldTimer({
  exerciseName,
  setLabel,
  target,
  onStop,
}: {
  exerciseName: string;
  /** The set the time goes into, e.g. "set 2", or null when every set is done. */
  setLabel: string | null;
  target: { min: number | null; max: number | null };
  onStop: (seconds: number) => void;
}) {
  const [timer, setTimer] = useState<Timer>(null);
  const now = useNow(timer !== null);
  const phase = timer ? holdPhase(timer, now) : null;
  const seconds = phase?.phase === "holding" ? phase.seconds : 0;
  const goal = target.max ?? target.min;
  const reached = goal !== null && phase?.phase === "holding" && seconds >= goal;

  // Buzz once when the hold starts and once when the target is reached.
  const buzzed = useRef({ start: false, goal: false });
  useEffect(() => {
    if (!timer) {
      buzzed.current = { start: false, goal: false };
      return;
    }
    if (phase?.phase === "holding" && !buzzed.current.start) {
      buzzed.current.start = true;
      navigator.vibrate?.(80);
    }
    if (reached && !buzzed.current.goal) {
      buzzed.current.goal = true;
      navigator.vibrate?.([120, 80, 120]);
    }
  }, [timer, phase?.phase, reached]);

  function stop() {
    if (!timer) return;
    const held = heldSeconds(timer, Date.now());
    setTimer(null);
    if (held >= 1) onStop(held);
  }

  const range = target.min && target.max && target.min !== target.max ? `${target.min}–${target.max} s` : goal ? `${goal} s` : null;

  return (
    <div
      className={cx("mt-3 rounded-2xl border px-3 py-2.5", reached ? "border-accent bg-accent-soft" : timer ? "border-accent-text/50 bg-surface-2/60" : "border-line")}
      role="timer"
      aria-label={`Hold timer for ${exerciseName}`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {phase?.phase === "count_in" ? "Get ready" : reached ? "Target reached" : timer ? "Holding" : "Hold timer"}
            {setLabel ? ` · ${setLabel}` : ""}
          </p>
          <p className={cx("text-3xl leading-tight font-semibold tabular", reached && "text-accent-text")} aria-live="off">
            {phase?.phase === "count_in" ? phase.secondsLeft : formatDuration(seconds)}
          </p>
          {!timer && range ? <p className="text-xs text-faint">Target {range}</p> : null}
        </div>
        {timer ? (
          <Button size="md" variant="primary" onClick={stop} aria-label={`Stop the hold for ${exerciseName}`}>Stop</Button>
        ) : (
          <Button
            size="md"
            variant="secondary"
            disabled={!setLabel}
            onClick={() => setTimer(startHold(Date.now()))}
            aria-label={`Start the hold timer for ${exerciseName}${setLabel ? `, ${setLabel}` : ""}`}
          >
            Start
          </Button>
        )}
      </div>
    </div>
  );
}
