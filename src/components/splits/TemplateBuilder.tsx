"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { exerciseLabel } from "@/lib/exercises";
import { formatDuration, formatTarget, humanize } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { Exercise } from "@/lib/types";
import { ExercisePicker } from "../ExercisePicker";
import { IconArrowDown, IconArrowUp, IconEdit, IconMinus, IconPlus, IconSwap, IconTrash } from "../icons";
import { cx } from "../styles";
import { Button, ErrorNote, Field, IconButton, Input, PageHeader, Sheet, inputClass } from "../ui";

export type Entry = {
  id: string;
  position: number;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  notes: string | null;
  exercise: Exercise;
};

const REST_OPTIONS = [null, 45, 60, 90, 120, 150, 180, 240, 300];

export function TemplateBuilder({
  splitId,
  splitName,
  template,
  initialEntries,
  defaultRest,
}: {
  splitId: string;
  splitName: string;
  template: { id: string; name: string };
  initialEntries: Entry[];
  defaultRest: number;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [entries, setEntries] = useState(initialEntries);
  const [name, setName] = useState(template.name);
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run<T>(op: PromiseLike<{ error: { message: string } | null; data?: T | null }>, fallback?: () => void) {
    setSaving(true);
    const { error, data } = await op;
    setSaving(false);
    if (error) {
      setError(friendlyError(error));
      fallback?.();
      return null;
    }
    setError(null);
    return data ?? true;
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await run(supabase.from("workout_templates").update({ name: name.trim() }).eq("id", template.id));
    if (ok) {
      setRenaming(false);
      router.refresh();
    }
  }

  async function pick(exercise: Exercise) {
    if (picker?.replace) {
      const id = picker.replace;
      const before = entries;
      setEntries((list) => list.map((e) => (e.id === id ? { ...e, exercise } : e)));
      await run(supabase.from("template_exercises").update({ exercise_id: exercise.id }).eq("id", id), () => setEntries(before));
      return;
    }
    const data = await run<Entry>(
      supabase
        .from("template_exercises")
        .insert({ template_id: template.id, exercise_id: exercise.id, position: entries.length, target_sets: 2, rep_min: 8, rep_max: 12 })
        .select("id, position, target_sets, rep_min, rep_max, rest_seconds, notes")
        .single(),
    );
    if (data && data !== true) setEntries((list) => [...list, { ...(data as Entry), exercise }]);
  }

  async function update(id: string, patch: Partial<Pick<Entry, "target_sets" | "rep_min" | "rep_max" | "rest_seconds" | "notes">>) {
    const before = entries;
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    await run(supabase.from("template_exercises").update(patch).eq("id", id), () => setEntries(before));
  }

  async function move(index: number, direction: -1 | 1) {
    const list = [...entries];
    const j = index + direction;
    [list[index], list[j]] = [list[j], list[index]];
    const before = entries;
    setEntries(list);
    setSaving(true);
    const results = await Promise.all(list.map((e, position) => supabase.from("template_exercises").update({ position }).eq("id", e.id)));
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(friendlyError(failed.error));
      setEntries(before);
    }
  }

  async function remove(id: string) {
    const before = entries;
    setEntries((list) => list.filter((e) => e.id !== id));
    await run(supabase.from("template_exercises").delete().eq("id", id), () => setEntries(before));
  }

  return (
    <>
      <PageHeader
        back={{ href: `/splits/${splitId}`, label: splitName }}
        eyebrow={splitName}
        title={
          <button type="button" onClick={() => setRenaming(true)} className="group inline-flex items-center gap-2 text-left">
            {name}
            <IconEdit size={18} className="text-faint group-hover:text-muted" />
            <span className="sr-only">Rename workout</span>
          </button>
        }
        action={<span className="text-xs text-faint" role="status">{saving ? "Saving…" : "Changes save automatically"}</span>}
      />
      <p className="-mt-3 mb-5 text-sm text-muted">Edits apply to future sessions. Workouts already logged keep what they were.</p>
      <ErrorNote>{error}</ErrorNote>

      <ol className="mt-3 space-y-3">
        {entries.map((entry, i) => {
          const dupes = entries.filter((e) => e.exercise.id === entry.exercise.id).length > 1;
          return (
            <li key={entry.id} className="rounded-3xl border border-line bg-surface p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{exerciseLabel(entry.exercise)}</h3>
                  <p className="text-sm text-muted">
                    {humanize(entry.exercise.primary_muscle)} · {humanize(entry.exercise.equipment)}
                    {entry.exercise.owner_id ? " · custom" : ""}
                    {dupes ? " · appears more than once" : ""}
                  </p>
                </div>
                <div className="-mt-1 -mr-2 flex">
                  <IconButton label={`Move ${entry.exercise.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={18} /></IconButton>
                  <IconButton label={`Move ${entry.exercise.name} down`} disabled={i === entries.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={18} /></IconButton>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-2xl bg-surface-2" role="group" aria-label="Working sets">
                  <IconButton label="Fewer sets" disabled={entry.target_sets <= 1} onClick={() => update(entry.id, { target_sets: entry.target_sets - 1 })}><IconMinus size={16} /></IconButton>
                  <span className="min-w-14 text-center text-sm tabular" aria-live="polite">{entry.target_sets} {entry.target_sets === 1 ? "set" : "sets"}</span>
                  <IconButton label="More sets" disabled={entry.target_sets >= 20} onClick={() => update(entry.id, { target_sets: entry.target_sets + 1 })}><IconPlus size={16} /></IconButton>
                </div>
                <button type="button" onClick={() => setEditing(entry)} className="h-11 rounded-2xl bg-surface-2 px-4 text-sm tabular hover:bg-surface-3">
                  {formatTarget(null, entry.rep_min, entry.rep_max) || "Set reps"}
                </button>
                <button type="button" onClick={() => setEditing(entry)} className="h-11 rounded-2xl bg-surface-2 px-4 text-sm text-muted hover:bg-surface-3">
                  Rest {formatDuration(entry.rest_seconds ?? defaultRest)}{entry.rest_seconds ? "" : " (default)"}
                </button>
              </div>
              {entry.notes ? <p className="mt-3 text-sm text-muted italic">{entry.notes}</p> : null}

              <div className="mt-2 -mb-1 flex flex-wrap gap-1">
                <Button size="sm" variant="quiet" onClick={() => setEditing(entry)}><IconEdit size={15} /> Targets & notes</Button>
                <Button size="sm" variant="quiet" onClick={() => setPicker({ replace: entry.id })}><IconSwap size={15} /> Replace</Button>
                <Button size="sm" variant="quiet" className="text-danger hover:text-danger" onClick={() => remove(entry.id)}><IconTrash size={15} /> Remove</Button>
              </div>
            </li>
          );
        })}
      </ol>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line px-6 py-8 text-center text-muted">No exercises yet. Add the first one below.</div>
      ) : null}

      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => setPicker({})}>
        <IconPlus size={18} /> Add exercise
      </Button>

      <ExercisePicker open={picker !== null} onClose={() => setPicker(null)} onPick={pick} title={picker?.replace ? "Replace exercise" : "Add exercise"} />

      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Rename workout">
        <form onSubmit={rename} className="space-y-4 pb-2">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />}</Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" busy={saving}>Save</Button>
        </form>
      </Sheet>

      {editing ? (
        <TargetsSheet
          key={editing.id}
          entry={editing}
          defaultRest={defaultRest}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await update(editing.id, patch);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function TargetsSheet({
  entry,
  defaultRest,
  onClose,
  onSave,
}: {
  entry: Entry;
  defaultRest: number;
  onClose: () => void;
  onSave: (patch: Partial<Entry>) => Promise<void>;
}) {
  const [min, setMin] = useState(entry.rep_min?.toString() ?? "");
  const [max, setMax] = useState(entry.rep_max?.toString() ?? "");
  const [rest, setRest] = useState<number | null>(entry.rest_seconds);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const rmin = min ? Number(min) : null;
    const rmax = max ? Number(max) : null;
    const valid = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 100);
    if (!valid(rmin) || !valid(rmax)) return setError("Reps must be whole numbers from 1 to 100.");
    if (rmin !== null && rmax !== null && rmin > rmax) return setError("The minimum cannot exceed the maximum.");
    void onSave({ rep_min: rmin, rep_max: rmax, rest_seconds: rest, notes: notes.trim() || null });
  }

  return (
    <Sheet open onClose={onClose} title={exerciseLabel(entry.exercise)}>
      <form onSubmit={submit} className="space-y-4 pb-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Rep range</legend>
          <div className="flex items-center gap-3">
            <Input aria-label="Minimum reps" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="8" className="text-center" />
            <span className="text-muted">to</span>
            <Input aria-label="Maximum reps" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="12" className="text-center" />
          </div>
        </fieldset>
        <Field label="Rest between sets">
          {(id) => (
            <select id={id} className={inputClass} value={rest ?? ""} onChange={(e) => setRest(e.target.value ? Number(e.target.value) : null)}>
              {REST_OPTIONS.map((r) => (
                <option key={r ?? "default"} value={r ?? ""}>{r ? formatDuration(r) : `Default (${formatDuration(defaultRest)})`}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Notes (optional)" hint="Shown when you log this exercise, e.g. seat height or tempo.">
          {(id, d) => (
            <textarea id={id} aria-describedby={d} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className={cx(inputClass, "h-auto py-3")} />
          )}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" className="w-full">Save</Button>
      </form>
    </Sheet>
  );
}
