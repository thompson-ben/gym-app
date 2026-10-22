import { endDayLabel, type AdminTrialsEnding } from "@/lib/admin";

/** When running trials end, day by day, and how many of those people have trained. */
export function TrialsEnding({ t, today }: { t: AdminTrialsEnding; today: string }) {
  if (!t.running) return null;
  const max = Math.max(1, ...t.by_day.map((d) => d.ending));
  const last = t.by_day.at(-1);
  return (
    <figure className="mt-3 rounded-3xl border border-line bg-surface p-4">
      <figcaption className="text-sm">
        <span className="font-medium">When running trials end</span>
        <span className="block text-muted">
          {t.running} running{last ? ` · last ends ${endDayLabel(last.day, today)}` : ""} · {t.trained} {t.trained === 1 ? "has" : "have"} trained
        </span>
      </figcaption>
      <ul className="mt-3 space-y-2" aria-label="Trials ending by day">
        {t.by_day.map((d) => (
          <li key={d.day} className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-3 text-sm">
            <span className="text-muted">{endDayLabel(d.day, today)}</span>
            <span className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span className="h-full bg-accent" style={{ width: `${(d.trained / max) * 100}%` }} />
              <span className="h-full bg-accent/35" style={{ width: `${((d.ending - d.trained) / max) * 100}%` }} />
            </span>
            <span className="text-right tabular">
              <span className="font-semibold">{d.ending}</span>
              <span className="text-muted"> · {d.trained} trained</span>
            </span>
          </li>
        ))}
      </ul>
      {t.later ? <p className="mt-2 text-xs text-faint">{t.later} more end after 30 days.</p> : null}
      <p className="mt-3 text-xs text-faint">UK days. Bright: has logged a workout (most likely to join). Pale: hasn’t trained yet.</p>
    </figure>
  );
}
