"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate, formatKg } from "@/lib/format";
import type { ProgressPoint } from "@/lib/progress";
import type { TrackingMode } from "@/lib/types";

const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Single-series line chart of the heaviest completed working set per session. */
export function ProgressChart({ points, mode, timeZone }: { points: ProgressPoint[]; mode: TrackingMode; timeZone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const unit = mode === "bodyweight_reps" ? "reps" : mode === "added_weight_reps" ? "kg added" : "kg";
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const ticks = niceTicks(Math.max(0, lo - (hi - lo) * 0.15 - 1), hi + (hi - lo) * 0.1 + 1);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const times = points.map((p) => new Date(p.date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const coords = points.map((p, i) => ({ x: x(times[i]), y: y(p.value) }));
  const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const fmt = (v: number) => (mode === "bodyweight_reps" ? `${v}` : formatKg(v));
  const label = (p: ProgressPoint) =>
    mode === "bodyweight_reps" ? `${p.value} reps` : `${mode === "added_weight_reps" ? "+" : ""}${formatKg(p.value)} kg × ${p.reps}`;

  function nearest(clientX: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    let best = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.x - px) < Math.abs(coords[best].x - px)) best = i;
    });
    setActive(best);
  }

  const a = active !== null ? points[active] : null;
  const ac = active !== null ? coords[active] : null;
  const firstLabel = formatDate(points[0].date, timeZone, { year: undefined });
  const lastLabel = formatDate(points[points.length - 1].date, timeZone, { year: undefined });

  return (
    <div
      ref={ref}
      className="relative select-none"
      onPointerMove={(e) => nearest(e.clientX)}
      onPointerDown={(e) => nearest(e.clientX)}
      onPointerLeave={() => setActive(null)}
    >
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Heaviest working set per session, ${points.length} sessions, from ${label(points[0])} to ${label(points[points.length - 1])}. Use arrow keys to inspect sessions.`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          else if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
          else if (e.key === "Escape") setActive(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setActive(null)}
        className="block overflow-visible rounded-xl"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--faint)" className="tabular">
              {fmt(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--faint)">{firstLabel}</text>
        {points.length > 1 ? <text x={width - PAD.right} y={H - 8} fontSize={11} fill="var(--faint)" textAnchor="end">{lastLabel}</text> : null}
        {ac ? <line x1={ac.x} x2={ac.x} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" /> : null}
        {points.length > 1 ? <path d={path} fill="none" stroke="var(--accent-text)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={active === i ? 6 : 4} fill="var(--accent-text)" stroke="var(--surface)" strokeWidth={2} />
        ))}
      </svg>
      {a && ac ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-max max-w-48 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(ac.x - 80, 0), width - 170) }}
        >
          <p className="font-semibold text-fg tabular">{label(a)}</p>
          <p className="text-muted">{formatDate(a.date, timeZone)} · {a.workout}</p>
        </div>
      ) : null}
      <p className="mt-1 text-xs text-faint">Y axis: {unit}</p>
    </div>
  );
}
