export type RestTimer = { startedAt: number; duration: number } | null;

/**
 * Remaining rest in seconds, derived from wall-clock timestamps so it stays correct after
 * the page was backgrounded, throttled or reloaded.
 */
export function remainingSeconds(timer: RestTimer, now: number): number | null {
  if (!timer) return null;
  return Math.max(0, timer.duration - (now - timer.startedAt) / 1000);
}

export function startTimer(duration: number, now: number): RestTimer {
  return { startedAt: now, duration: Math.max(1, Math.round(duration)) };
}

/** Adjusts the duration of a running timer (e.g. +15 s) without resetting it. */
export function adjustTimer(timer: RestTimer, deltaSeconds: number, now: number): RestTimer {
  if (!timer) return timer;
  const elapsed = (now - timer.startedAt) / 1000;
  return { ...timer, duration: Math.max(Math.ceil(elapsed) + 1, timer.duration + deltaSeconds) };
}

/** Wall-clock time in ms (kept here so components stay pure). */
export const clockNow = () => Date.now();
