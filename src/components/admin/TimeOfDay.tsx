import { busiestWindow, hourLabel, pct, type AdminTimeOfDay, type TimeSeries } from "@/lib/admin";
import { DAY_SHORT, WEEKDAYS } from "@/lib/training-days";

function Bars({ values, labels, title, unit }: { values: number[]; labels: string[]; title: string; unit: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-16 items-end gap-[2px]" role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${v}`).join(", ")}`}>
      {values.map((v, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 items-end" title={`${labels[i]}: ${v} ${unit}`}>
          <div className="w-full rounded-t-[3px] bg-accent" style={{ height: v ? `${Math.max(6, (v / max) * 100)}%` : 2, opacity: v ? 1 : 0.25 }} />
        </div>
      ))}
    </div>
  );
}

function Row({ title, unit, s }: { title: string; unit: string; s: TimeSeries }) {
  const total = s.by_hour.reduce((n, x) => n + x, 0);
  const peak = busiestWindow(s.by_hour);
  const topDay = s.by_weekday.indexOf(Math.max(...s.by_weekday));
  const hours = Array.from({ length: 24 }, (_, h) => `${hourLabel(h)}–${hourLabel(h + 1)}`);
  return (
    <figure className="rounded-3xl border border-line bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted tabular">
          {total
            ? `${total} · busiest ${peak!.label} (${pct(peak!.count, total)}) · ${DAY_SHORT[WEEKDAYS[topDay]]}s most`
            : `None in this range`}
        </span>
      </figcaption>
      {total ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-[3fr_1fr]">
          <div>
            <Bars values={s.by_hour} labels={hours} title={`${title} by hour`} unit={unit} />
            <div className="relative mt-1.5 h-4 text-xs text-faint tabular" aria-hidden="true">
              {[0, 6, 12, 18].map((h) => (
                <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${(h / 24) * 100}%` }}>{hourLabel(h)}</span>
              ))}
            </div>
          </div>
          <div>
            <Bars values={s.by_weekday} labels={WEEKDAYS.map((d) => DAY_SHORT[d])} title={`${title} by day of week`} unit={unit} />
            <div className="mt-1.5 flex justify-between text-xs text-faint">
              {WEEKDAYS.map((d) => <span key={d}>{DAY_SHORT[d].slice(0, 1)}</span>)}
            </div>
          </div>
        </div>
      ) : null}
    </figure>
  );
}

/** When people visit, sign up and train, by hour and weekday (UK time). */
export function TimeOfDay({ t }: { t: AdminTimeOfDay }) {
  return (
    <div className="space-y-3">
      <Row title="Visits" unit="visits" s={t.visits} />
      <Row title="Sign-ups" unit="sign-ups" s={t.signups} />
      <Row title="Workouts finished" unit="workouts" s={t.workouts} />
      <p className="text-xs text-faint">UK time. Hover (or press) a bar for its count. With small numbers, compare over 30 or 90 days rather than a single day.</p>
    </div>
  );
}
