import { formatDate } from "@/lib/format";
import { pct } from "@/lib/admin";

export function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{value.toLocaleString("en-GB")}</p>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

/** Each step as a share of the first, with the conversion from the step before. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, ...steps.map((s) => s.value), 1);
  return (
    <ol className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{s.label}</span>
            <span className="tabular">
              <span className="font-semibold">{s.value}</span>
              {i > 0 ? <span className="ml-2 text-muted">{pct(s.value, steps[i - 1].value)} of previous</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(s.value / top) * 100}%`, minWidth: s.value ? 6 : 0 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One series per chart, one bar per day. Hover (or long-press) a bar for its value. */
export function BarStrip({ title, unit, points }: { title: string; unit: string; points: { day: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((n, p) => n + p.value, 0);
  const label = (day: string) => formatDate(`${day}T12:00:00Z`, "UTC", { year: undefined });
  return (
    <figure className="rounded-3xl border border-line bg-surface p-4">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted tabular">{total} in total · peak {max === 1 && total === 0 ? 0 : max}</span>
      </figcaption>
      <div className="mt-3 flex h-24 items-end gap-[2px]" role="img" aria-label={`${title} per day, ${total} in total`}>
        {points.map((p) => (
          <div key={p.day} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${label(p.day)}: ${p.value} ${unit}`}>
            <div
              className="w-full rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: p.value ? `${Math.max(4, (p.value / max) * 100)}%` : 2, opacity: p.value ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-faint tabular">
        <span>{points[0] ? label(points[0].day) : ""}</span>
        <span>{points.at(-1) ? label(points.at(-1)!.day) : ""}</span>
      </div>
    </figure>
  );
}
