"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button, ErrorNote, Field, Input, cx, inputClass } from "../ui";

export type WorkoutOption = { id: string; name: string; splitName: string; exerciseCount: number };

/**
 * Creates a group workout from one of the user's workouts (its exercises are copied into the
 * group plan, which the host can then change) or from scratch.
 */
export function NewGroupWorkoutForm({ workouts, defaultDisplayName }: { workouts: WorkoutOption[]; defaultDisplayName: string }) {
  const router = useRouter();
  const [source, setSource] = useState<string | null>(workouts[0]?.id ?? null);
  const [name, setName] = useState(workouts[0]?.name ?? "");
  const [nameTouched, setNameTouched] = useState(false);
  const [when, setWhen] = useState("");
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(id: string | null) {
    setSource(id);
    if (!nameTouched) setName(id ? (workouts.find((w) => w.id === id)?.name ?? "") : "Group workout");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the workout a name.");
    if (!displayName.trim()) return setError("Add the name your training partners will see.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("create_group_workout", {
      p_name: name.trim(),
      p_display_name: displayName.trim(),
      p_template_id: source,
      // datetime-local is the phone's local time.
      p_planned_for: when ? new Date(when).toISOString() : null,
    });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error, "Could not create the group workout."));
    }
    router.push(`/together/${data as string}`);
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-8">
      <p className="text-muted">
        Plan a workout to do with friends. Share the link, and everyone logs their own sets on their own phone. Partners see who has started and finished,
        never your weights or reps.
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Start from</legend>
        <div role="radiogroup" aria-label="Start from" className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {workouts.map((w) => (
            <Choice key={w.id} checked={source === w.id} onSelect={() => choose(w.id)} title={w.name} detail={`${w.splitName} · ${w.exerciseCount} ${w.exerciseCount === 1 ? "exercise" : "exercises"}`} />
          ))}
          <Choice checked={source === null} onSelect={() => choose(null)} title="Start empty" detail="Pick the exercises next" />
        </div>
        <p className="mt-2 text-sm text-faint">The exercises are copied into the group plan. Changing them there doesn’t change your workout.</p>
      </fieldset>

      <Field label="Name">
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            maxLength={60}
            required
          />
        )}
      </Field>

      <Field label="When (optional)" hint="Shown on the invite so everyone knows when to meet.">
        {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />}
      </Field>

      <Field label="Your name" hint="What your training partners will see. Your email is never shown.">
        {(id, d) => <Input id={id} aria-describedby={d} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} autoComplete="given-name" required />}
      </Field>

      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Create and get invite link</Button>
    </form>
  );
}

function Choice({ checked, onSelect, title, detail }: { checked: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="flex min-h-15 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50">
      <span aria-hidden="true" className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-accent-text" : "border-line")}>
        {checked ? <span className="h-2.5 w-2.5 rounded-full bg-accent-text" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
    </button>
  );
}
