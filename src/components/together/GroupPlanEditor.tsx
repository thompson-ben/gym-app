"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTarget } from "@/lib/format";
import { groupExerciseLabel, type GroupExercise } from "@/lib/group";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { Exercise } from "@/lib/types";
import { ExercisePicker } from "../ExercisePicker";
import { IconArrowDown, IconArrowUp, IconMinus, IconPlus, IconTrash } from "../icons";
import { Button, ErrorNote, IconButton, Input, Sheet } from "../ui";

/** The host's editor for a group plan: add, remove, reorder, sets and rep range. */
export function GroupPlanEditor({ groupId, initial }: { groupId: string; initial: GroupExercise[] }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [entries, setEntries] = useState(initial);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<GroupExercise | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(op: PromiseLike<{ error: { message: string } | null }>, revert: () => void) {
    setError(null);
    const { error } = await op;
    if (error) {
      revert();
      setError(friendlyError(error, "Not saved. Please try again."));
    }
    router.refresh();
  }

  function patch(id: string, p: Partial<Pick<GroupExercise, "target_sets" | "rep_min" | "rep_max">>) {
    const before = entries;
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...p } : e)));
    void run(supabase.from("group_workout_exercises").update(p).eq("id", id), () => setEntries(before));
  }

  function remove(id: string) {
    const before = entries;
    setEntries((list) => list.filter((e) => e.id !== id));
    void run(supabase.from("group_workout_exercises").delete().eq("id", id), () => setEntries(before));
  }

  function move(index: number, by: -1 | 1) {
    const before = entries;
    const next = [...entries];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    const renumbered = next.map((e, i) => ({ ...e, position: i }));
    setEntries(renumbered);
    void run(
      Promise.all(renumbered.map((e) => supabase.from("group_workout_exercises").update({ position: e.position }).eq("id", e.id))).then(
        (results) => ({ error: results.find((r) => r.error)?.error ?? null }),
      ),
      () => setEntries(before),
    );
  }

  async function add(picked: Exercise[]) {
    setError(null);
    const start = entries.length ? Math.max(...entries.map((e) => e.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("group_workout_exercises")
      .insert(picked.map((x, i) => ({ group_workout_id: groupId, exercise_id: x.id, position: start + i, target_sets: 3, rep_min: 8, rep_max: 12 })))
      .select("id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes");
    if (error) return setError(friendlyError(error, "Could not add the exercise."));
    const byId = new Map(picked.map((x) => [x.id, x]));
    setEntries((list) => [
      ...list,
      ...data.map((row) => {
        const x = byId.get(row.exercise_id)!;
        return { ...row, name: x.name, variant: x.variant, tracking_mode: x.tracking_mode, custom: Boolean(x.owner_id) };
      }),
    ]);
    router.refresh();
  }

  return (
    <div>
      {entries.length ? (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li key={e.id} className="rounded-3xl border border-line bg-surface p-3 pl-4">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 pt-2 font-medium">{groupExerciseLabel(e)}</p>
                <div className="-mr-1 flex">
                  <IconButton label={`Move ${e.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={18} /></IconButton>
                  <IconButton label={`Move ${e.name} down`} disabled={i === entries.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={18} /></IconButton>
                  <IconButton label={`Remove ${e.name}`} onClick={() => remove(e.id)}><IconTrash size={18} /></IconButton>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-2xl bg-surface-2" role="group" aria-label={`${e.name} working sets`}>
                  <IconButton label="Fewer sets" disabled={e.target_sets <= 1} onClick={() => patch(e.id, { target_sets: e.target_sets - 1 })}><IconMinus size={16} /></IconButton>
                  <span className="min-w-14 text-center text-sm tabular" aria-live="polite">{e.target_sets} {e.target_sets === 1 ? "set" : "sets"}</span>
                  <IconButton label="More sets" disabled={e.target_sets >= 20} onClick={() => patch(e.id, { target_sets: e.target_sets + 1 })}><IconPlus size={16} /></IconButton>
                </div>
                <button type="button" onClick={() => setEditing(e)} className="h-11 rounded-2xl bg-surface-2 px-4 text-sm tabular hover:bg-surface-3" aria-label={`${e.name} rep range`}>
                  {formatTarget(null, e.rep_min, e.rep_max) || "Set reps"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-muted">No exercises yet. Add the first one.</p>
      )}
      <ErrorNote>{error}</ErrorNote>
      <Button variant="secondary" className="mt-3 w-full" onClick={() => setPicker(true)}>
        <IconPlus size={18} /> Add exercises
      </Button>
      {entries.some((e) => e.custom) ? (
        <p className="mt-2 text-sm text-faint">Your custom exercises are added to each partner’s list the first time they train them.</p>
      ) : null}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPickMany={(list) => void add(list)} title="Add to the plan" />
      {editing ? (
        <RepsSheet
          key={editing.id}
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(min, max) => {
            patch(editing.id, { rep_min: min, rep_max: max });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RepsSheet({ entry, onClose, onSave }: { entry: GroupExercise; onClose: () => void; onSave: (min: number | null, max: number | null) => void }) {
  const [min, setMin] = useState(entry.rep_min?.toString() ?? "");
  const [max, setMax] = useState(entry.rep_max?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const rmin = min ? Number(min) : null;
    const rmax = max ? Number(max) : null;
    const valid = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 100);
    if (!valid(rmin) || !valid(rmax)) return setError("Reps must be whole numbers from 1 to 100.");
    if (rmin !== null && rmax !== null && rmin > rmax) return setError("The minimum cannot exceed the maximum.");
    onSave(rmin, rmax);
  }

  return (
    <Sheet open onClose={onClose} title={groupExerciseLabel(entry)}>
      <form onSubmit={submit} className="space-y-4 pb-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Rep range</legend>
          <div className="flex items-center gap-3">
            <Input aria-label="Minimum reps" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="8" className="text-center" />
            <span className="text-muted">to</span>
            <Input aria-label="Maximum reps" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="12" className="text-center" />
          </div>
        </fieldset>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" className="w-full">Save</Button>
      </form>
    </Sheet>
  );
}
