/**
 * Stopwatch for timed holds (pure; unit-tested). Start gives a short count-in to get into
 * position, then counts up. Time always comes from timestamps, so a locked screen or a
 * throttled tab never loses seconds.
 */
export const HOLD_COUNT_IN = 3;

/** When the hold itself starts (after the count-in), in ms since the epoch. */
export type HoldTimer = { holdStartsAt: number } | null;

export function startHold(now: number, countIn: number = HOLD_COUNT_IN): NonNullable<HoldTimer> {
  return { holdStartsAt: now + countIn * 1000 };
}

export type HoldPhase = { phase: "count_in"; secondsLeft: number } | { phase: "holding"; seconds: number };

export function holdPhase(timer: NonNullable<HoldTimer>, now: number): HoldPhase {
  const ms = now - timer.holdStartsAt;
  if (ms < 0) return { phase: "count_in", secondsLeft: Math.ceil(-ms / 1000) };
  return { phase: "holding", seconds: Math.floor(ms / 1000) };
}

/** Whole seconds held when stopped; 0 if stopped during the count-in. */
export function heldSeconds(timer: NonNullable<HoldTimer>, now: number): number {
  const p = holdPhase(timer, now);
  return p.phase === "holding" ? p.seconds : 0;
}
