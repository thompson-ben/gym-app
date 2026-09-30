import type { PreviousSet, TrackingMode } from "./types";

export type HistorySession = {
  session_id: string;
  completed_at: string;
  template_name: string;
  split_name: string | null;
  split_id: string | null;
  sets: PreviousSet[];
};

export type ProgressPoint = {
  sessionId: string;
  date: string;
  /** Heaviest load of a completed working set (or most reps for reps-only exercises). */
  value: number;
  /** Reps of that set (the heaviest set with the most reps when loads tie). */
  reps: number;
  workout: string;
};

/**
 * One point per session: the heaviest completed *working* set. Warm-ups are ignored. When
 * several sets share the top load, the one with the most reps is reported. This is a load
 * metric only; it does not claim that a heavier set is a better performance.
 */
export function heaviestSetPerSession(history: HistorySession[], mode: TrackingMode): ProgressPoint[] {
  const points: ProgressPoint[] = [];
  for (const s of history) {
    const working = s.sets.filter((x) => x.set_type === "working");
    if (!working.length) continue;
    const metric = (x: PreviousSet) => (mode === "bodyweight_reps" ? x.reps : (x.weight_kg ?? 0));
    const best = working.reduce((a, b) => (metric(b) > metric(a) || (metric(b) === metric(a) && b.reps > a.reps) ? b : a));
    points.push({ sessionId: s.session_id, date: s.completed_at, value: metric(best), reps: best.reps, workout: s.template_name });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Chart metrics
// ---------------------------------------------------------------------------

export type Metric = "e1rm" | "volume" | "heaviest" | "reps";

/**
 * Estimated one-rep max (Epley): weight × (1 + reps / 30). A single is its own 1RM.
 * Reasonably accurate up to ~12 reps; an estimate, never a recorded result.
 */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type MetricInfo = { id: Metric; label: string; title: string; unit: string; description: string };

/** Metrics that are meaningful for a tracking mode, default first. */
export function metricsFor(mode: TrackingMode): MetricInfo[] {
  if (mode === "weight_reps") {
    return [
      {
        id: "e1rm",
        label: "Est. 1RM",
        title: "Estimated 1-rep max, best set per session",
        unit: "kg",
        description:
          "Estimated from each session's best working set with the Epley formula: weight × (1 + reps ÷ 30). Lets sets in different rep ranges be compared. An estimate, most reliable up to about 12 reps.",
      },
      {
        id: "volume",
        label: "Volume",
        title: "Session volume",
        unit: "kg",
        description: "Weight × reps added up over all working sets in the session. Measures total work done, not strength.",
      },
      {
        id: "heaviest",
        label: "Heaviest",
        title: "Heaviest working set per session",
        unit: "kg",
        description: "Top weight lifted in a working set, regardless of reps.",
      },
    ];
  }
  const heaviest: MetricInfo =
    mode === "bodyweight_reps"
      ? { id: "heaviest", label: "Best set", title: "Most reps in a working set", unit: "reps", description: "The most reps completed in a single working set." }
      : {
          id: "heaviest",
          label: "Heaviest",
          title: "Most added weight in a working set",
          unit: "kg added",
          description: "Top load added to bodyweight in a working set. Bodyweight itself is not tracked, so no 1RM estimate is shown.",
        };
  return [
    heaviest,
    { id: "reps", label: "Total reps", title: "Total reps per session", unit: "reps", description: "Reps added up over all working sets in the session." },
  ];
}

export type SeriesPoint = {
  sessionId: string;
  date: string;
  value: number;
  /** The set(s) behind the value, in the user's own numbers, e.g. "30 kg × 12". */
  detail: string;
  workout: string;
};

const setText = (mode: TrackingMode, s: PreviousSet) =>
  mode === "bodyweight_reps" ? `${s.reps} reps` : `${mode === "added_weight_reps" ? "+" : ""}${round1(s.weight_kg ?? 0)} kg × ${s.reps}`;

/** One point per session for the chosen metric, oldest first. Warm-ups never count. */
export function progressSeries(history: HistorySession[], mode: TrackingMode, metric: Metric): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const s of history) {
    const working = s.sets.filter((x) => x.set_type === "working");
    if (!working.length) continue;
    const base = { sessionId: s.session_id, date: s.completed_at, workout: s.template_name };
    if (metric === "e1rm" && mode === "weight_reps") {
      const best = bestSet(working, mode)!;
      points.push({ ...base, value: round1(estimate1RM(best.weight_kg ?? 0, best.reps)), detail: setText(mode, best) });
    } else if (metric === "volume" && mode === "weight_reps") {
      const total = working.reduce((n, x) => n + (x.weight_kg ?? 0) * x.reps, 0);
      points.push({ ...base, value: round1(total), detail: `${working.length} working ${working.length === 1 ? "set" : "sets"}` });
    } else if (metric === "reps") {
      const total = working.reduce((n, x) => n + x.reps, 0);
      points.push({ ...base, value: total, detail: `${working.length} working ${working.length === 1 ? "set" : "sets"}` });
    } else {
      const [p] = heaviestSetPerSession([s], mode);
      const top = working.find((x) => (mode === "bodyweight_reps" ? x.reps : (x.weight_kg ?? 0)) === p.value && x.reps === p.reps)!;
      points.push({ ...base, value: p.value, detail: setText(mode, top) });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Strength score of a set: e1RM for loaded lifts, reps for bodyweight, load then reps for added weight. */
function setScore(mode: TrackingMode, x: PreviousSet): number {
  if (mode === "weight_reps") return estimate1RM(x.weight_kg ?? 0, x.reps);
  if (mode === "bodyweight_reps") return x.reps;
  return (x.weight_kg ?? 0) * 1000 + x.reps;
}

/** The strongest working set (first one wins a tie). */
export function bestSet(sets: PreviousSet[], mode: TrackingMode): PreviousSet | null {
  const working = sets.filter((x) => x.set_type === "working");
  if (!working.length) return null;
  return working.reduce((a, b) => (setScore(mode, b) > setScore(mode, a) ? b : a));
}

/** Best set across all sessions shown, with where it happened, for the summary line. */
export function bestSetOverall(history: HistorySession[], mode: TrackingMode) {
  let best: { set: PreviousSet; date: string; workout: string; e1rm: number | null } | null = null;
  for (const s of history) {
    const top = bestSet(s.sets, mode);
    if (!top) continue;
    const candidate = { set: top, date: s.completed_at, workout: s.template_name, e1rm: mode === "weight_reps" ? round1(estimate1RM(top.weight_kg ?? 0, top.reps)) : null };
    if (!best || setScore(mode, top) > setScore(mode, best.set)) best = candidate;
  }
  return best && { ...best, text: setText(mode, best.set) };
}

/** Estimated 1RM of a session's best working set (loaded lifts only). */
export function sessionE1RM(sets: PreviousSet[]): number | null {
  const top = bestSet(sets, "weight_reps");
  return top ? round1(estimate1RM(top.weight_kg ?? 0, top.reps)) : null;
}
