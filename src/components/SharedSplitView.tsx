import { humanize, formatDuration, formatTarget } from "@/lib/format";

export type SharedExercise =
  | { kind: "catalogue"; id: string; name: string; primary_muscle: string; equipment: string; tracking_mode: string }
  | { kind: "custom"; ref: string; name: string; variant: string | null; primary_muscle: string; equipment: string; tracking_mode: string };

export type SharedSnapshot = {
  version: 1;
  workouts: {
    name: string;
    exercises: { exercise: SharedExercise; target_sets: number; rep_min: number | null; rep_max: number | null; rest_seconds: number | null; notes: string | null }[];
  }[];
};

/** Renders exactly the content a share link exposes. Used for both the owner's preview and recipients. */
export function SharedSplitView({ snapshot }: { snapshot: SharedSnapshot }) {
  if (!snapshot.workouts.length) return <p className="text-sm text-muted">This split has no workouts.</p>;
  return (
    <div className="space-y-3">
      {snapshot.workouts.map((w, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface-2/40 p-4">
          <h4 className="font-semibold">{w.name}</h4>
          {w.exercises.length ? (
            <ul className="mt-2 space-y-2">
              {w.exercises.map((x, j) => (
                <li key={j} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      {x.exercise.name}
                      {x.exercise.kind === "custom" && x.exercise.variant ? <span className="text-muted"> · {x.exercise.variant}</span> : null}
                      {x.exercise.kind === "custom" ? <span className="ml-2 rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">Custom</span> : null}
                    </span>
                    <span className="shrink-0 text-muted tabular">{formatTarget(x.target_sets, x.rep_min, x.rep_max)}</span>
                  </div>
                  <p className="text-xs text-faint">
                    {humanize(x.exercise.primary_muscle)} · {humanize(x.exercise.equipment)}
                    {x.rest_seconds ? ` · rest ${formatDuration(x.rest_seconds)}` : ""}
                  </p>
                  {x.notes ? <p className="mt-0.5 text-xs text-muted italic">“{x.notes}”</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-faint">No exercises</p>
          )}
        </div>
      ))}
    </div>
  );
}
