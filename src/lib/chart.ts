/**
 * Evenly spaced "nice" axis ticks (steps of 1, 2, 2.5 or 5 × 10ⁿ) that always cover the whole
 * range: the first tick is at or below `min` and the last at or above `max`, so no data point
 * can sit outside the plotted area.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; ; v += step) {
    ticks.push(Math.round(v * 100) / 100);
    if (v >= max - step * 1e-6) break;
  }
  return ticks;
}
