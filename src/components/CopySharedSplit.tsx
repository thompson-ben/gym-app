"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { exerciseLabel, similarExercises } from "@/lib/exercises";
import { humanize } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { Exercise } from "@/lib/types";
import { loadExercises } from "./ExercisePicker";
import type { SharedExercise, SharedSnapshot } from "./SharedSplitView";
import { cx } from "./styles";
import { Button, ErrorNote, inputClass } from "./ui";

type Custom = Extract<SharedExercise, { kind: "custom" }>;
type Choice = { action: "create" } | { action: "map"; exercise_id: string };

/**
 * Copies a shared split. Catalogue exercises keep their identity automatically. Custom
 * exercises are never matched silently: each one becomes a new exercise of your own unless
 * you explicitly pick one of your existing exercises for it.
 */
export function CopySharedSplit({ token, snapshot }: { token: string; snapshot: SharedSnapshot }) {
  const router = useRouter();
  const customs = useMemo(() => {
    const seen = new Map<string, Custom>();
    for (const w of snapshot.workouts) for (const x of w.exercises) if (x.exercise.kind === "custom") seen.set(x.exercise.ref, x.exercise);
    return [...seen.values()];
  }, [snapshot]);
  const [mine, setMine] = useState<Exercise[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customs.length) return;
    loadExercises().then(setMine).catch(() => setMine([]));
  }, [customs.length]);

  async function copy() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("copy_shared_split", { p_token: token, p_custom_choices: choices });
    setBusy(false);
    if (error) return setError(friendlyError(error, "Could not copy this split."));
    router.push(`/splits/${data}`);
  }

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-surface p-5">
      <div>
        <p className="font-medium">Copy to my splits</p>
        <p className="text-sm text-muted">You get an independent copy. It is not activated, and later changes by the sharer do not affect it.</p>
      </div>

      {customs.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Custom exercises</p>
          <p className="text-sm text-muted">
            These are the sharer’s own exercises. By default each becomes a new exercise in your account with an empty history. If you already track the same movement, choose it to keep one history.
          </p>
          {customs.map((c) => {
            const selectId = `map-${c.ref}`;
            const suggestions = mine ? [...mine.filter((m) => m.origin_exercise_id === c.ref), ...similarExercises(mine, c.name)] : [];
            const choice = choices[c.ref] ?? { action: "create" };
            return (
              <div key={c.ref} className="rounded-2xl bg-surface-2 p-3">
                <p className="font-medium">{c.name}{c.variant ? <span className="text-muted"> · {c.variant}</span> : null}</p>
                <p className="text-xs text-faint">{humanize(c.primary_muscle)} · {humanize(c.equipment)}</p>
                <label htmlFor={selectId} className="mt-2 block text-sm text-muted">Use as</label>
                <select
                  id={selectId}
                  className={cx(inputClass, "mt-1 bg-surface")}
                  value={choice.action === "map" ? choice.exercise_id : ""}
                  onChange={(e) =>
                    setChoices((prev) => ({ ...prev, [c.ref]: e.target.value ? { action: "map", exercise_id: e.target.value } : { action: "create" } }))
                  }
                >
                  <option value="">New custom exercise (empty history)</option>
                  {suggestions.length ? (
                    <optgroup label="Suggested from your exercises">
                      {[...new Map(suggestions.map((s) => [s.id, s])).values()].map((s) => (
                        <option key={s.id} value={s.id}>{exerciseLabel(s)}{s.origin_exercise_id === c.ref ? " (copied before)" : ""}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  {mine ? (
                    <optgroup label="All exercises">
                      {mine.map((m) => <option key={m.id} value={m.id}>{exerciseLabel(m)}{m.owner_id ? " (custom)" : ""}</option>)}
                    </optgroup>
                  ) : null}
                </select>
              </div>
            );
          })}
        </div>
      ) : null}

      <ErrorNote>{error}</ErrorNote>
      <Button variant="primary" size="lg" className="w-full" busy={busy} onClick={copy}>Copy split</Button>
    </div>
  );
}
