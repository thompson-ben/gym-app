"use client";

import { useEffect, useRef, useState } from "react";
import { niceTicks } from "@/lib/chart";
import { formatDate, formatKg } from "@/lib/format";
import type { SeriesPoint } from "@/lib/progress";

const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

/** Single-series line chart of one metric per session. Tooltips show the real set(s) behind each value. */
export function ProgressChart({ points, title, unit, timeZone }: { points: SeriesPoint[]; title: string; unit: string; timeZone: string }) {
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
  const fmt = (v: number) => formatKg(v);
  const label = (p: SeriesPoint) => `${fmt(p.value)} ${unit}`;

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
      className="relative touch-pan-y select-none"
      onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons ? nearest(e.clientX) : undefined)}
      onPointerDown={(e) => nearest(e.clientX)}
      // On touch the last inspected point stays visible after lifting the finger.
      onPointerLeave={(e) => (e.pointerType === "mouse" ? setActive(null) : undefined)}
    >
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${title}, ${points.length} sessions, from ${label(points[0])} to ${label(points[points.length - 1])}. Use arrow keys to inspect sessions.`}
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
          <p className="text-muted tabular">{a.detail}</p>
          <p className="text-muted">{formatDate(a.date, timeZone)} · {a.workout}</p>
        </div>
      ) : null}
      <p className="mt-1 text-xs text-faint">Y axis: {unit} · tap or drag across the chart to inspect a session</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer py-1 text-muted">Show as table</summary>
        <table className="mt-2 w-full text-left tabular">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-faint">
              <th scope="col" className="py-1 font-normal">Date</th>
              <th scope="col" className="py-1 font-normal">{unit}</th>
              <th scope="col" className="py-1 font-normal">From</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.sessionId} className="border-t border-line">
                <td className="py-1.5">{formatDate(p.date, timeZone)}</td>
                <td className="py-1.5">{fmt(p.value)}</td>
                <td className="py-1.5 text-muted">{p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
