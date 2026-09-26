"use client";

import { useEffect, useMemo, useState } from "react";
import { EXERCISE_COLUMNS, exerciseLabel, searchExercises, similarExercises } from "@/lib/exercises";
import { humanize } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { EQUIPMENT, MUSCLES, TRACKING_MODES, type Exercise, type TrackingMode } from "@/lib/types";
import { IconPlus, IconSearch } from "./icons";
import { cx } from "./styles";
import { Button, ErrorNote, Field, Input, Sheet, Spinner, inputClass } from "./ui";

let cache: Exercise[] | null = null;

export async function loadExercises(force = false): Promise<Exercise[]> {
  if (cache && !force) return cache;
  const { data, error } = await supabaseBrowser()
    .from("exercises")
    .select(EXERCISE_COLUMNS)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  cache = data as Exercise[];
  return cache;
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = "Add exercise",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  title?: string;
}) {
  const [all, setAll] = useState<Exercise[] | null>(cache);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadExercises()
      .then((list) => !cancelled && setAll(list))
      .catch((e) => !cancelled && setLoadError(friendlyError(e, "Could not load exercises. Check your connection.")));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const results = useMemo(() => (all ? searchExercises(all, query, muscle) : []), [all, query, muscle]);
  const custom = results.filter((e) => e.owner_id);
  const catalogue = results.filter((e) => !e.owner_id);

  function close() {
    setCreating(false);
    setQuery("");
    setMuscle(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title={creating ? "New custom exercise" : title}>
      {creating ? (
        <CustomExerciseForm
          initialName={query}
          existing={all ?? []}
          onCancel={() => setCreating(false)}
          onPickExisting={(e) => { onPick(e); close(); }}
          onCreated={(e) => {
            cache = cache ? [...cache, e].sort((a, b) => a.name.localeCompare(b.name)) : null;
            setAll(cache);
            onPick(e);
            close();
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="sticky top-[4.25rem] z-[5] -mx-5 space-y-3 bg-surface px-5 pb-2">
            <div className="relative">
              <IconSearch size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
              <Input
                aria-label="Search exercises"
                placeholder="Search exercises"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-11"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by muscle">
              {[null, ...MUSCLES].map((m) => (
                <button
                  key={m ?? "all"}
                  type="button"
                  aria-pressed={muscle === m}
                  onClick={() => setMuscle(m)}
                  className={cx(
                    "h-9 shrink-0 rounded-full px-3.5 text-sm transition",
                    muscle === m ? "bg-fg text-bg font-medium" : "bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  {m ? humanize(m) : "All"}
                </button>
              ))}
            </div>
          </div>

          {loadError ? <ErrorNote>{loadError}</ErrorNote> : null}
          {!all && !loadError ? (
            <div className="flex justify-center py-10 text-muted"><Spinner /></div>
          ) : null}

          {all ? (
            <>
              <Button variant="secondary" className="w-full justify-start" onClick={() => setCreating(true)}>
                <IconPlus size={18} /> Create custom exercise{query ? ` “${query}”` : ""}
              </Button>
              {custom.length ? <ExerciseList label="Your exercises" items={custom} onPick={(e) => { onPick(e); close(); }} /> : null}
              {catalogue.length ? <ExerciseList label="Catalogue" items={catalogue} onPick={(e) => { onPick(e); close(); }} /> : null}
              {!results.length ? <p className="py-6 text-center text-sm text-muted">No matching exercises. Create a custom one above.</p> : null}
            </>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

function ExerciseList({ label, items, onPick }: { label: string; items: Exercise[]; onPick: (e: Exercise) => void }) {
  return (
    <section>
      <h3 className="py-2 text-xs font-medium tracking-wide text-faint uppercase">{label}</h3>
      <ul className="divide-y divide-line">
        {items.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left hover:bg-surface-2/50">
              <span className="min-w-0">
                <span className="block truncate font-medium">{exerciseLabel(e)}</span>
                <span className="block truncate text-sm text-muted">
                  {humanize(e.primary_muscle)} · {humanize(e.equipment)}
                  {e.tracking_mode === "added_weight_reps" ? " · added weight" : e.tracking_mode === "bodyweight_reps" ? " · reps only" : ""}
                </span>
              </span>
              {e.owner_id ? <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Custom</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomExerciseForm({
  initialName = "",
  existing,
  onCancel,
  onCreated,
  onPickExisting,
}: {
  initialName?: string;
  existing: Exercise[];
  onCancel: () => void;
  onCreated: (e: Exercise) => void;
  onPickExisting?: (e: Exercise) => void;
}) {
  const [name, setName] = useState(initialName);
  const [variant, setVariant] = useState("");
  const [muscle, setMuscle] = useState<string>("chest");
  const [equipment, setEquipment] = useState<string>("machine");
  const [mode, setMode] = useState<TrackingMode>("weight_reps");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const similar = useMemo(() => similarExercises(existing, name), [existing, name]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the exercise a name.");
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { data: claims } = await supabase.auth.getClaims();
    const { data, error } = await supabase
      .from("exercises")
      .insert({
        owner_id: claims?.claims.sub,
        name: name.trim(),
        variant: variant.trim() || null,
        primary_muscle: muscle,
        equipment,
        tracking_mode: mode,
      })
      .select(EXERCISE_COLUMNS)
      .single();
    setBusy(false);
    if (error) return setError(friendlyError(error, "Could not create the exercise."));
    onCreated(data as Exercise);
  }

  return (
    <form onSubmit={create} className="space-y-4">
      <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />}</Field>
      {similar.length && onPickExisting ? (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Similar exercises already exist. Use one to keep a single history, or create a separate exercise:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {similar.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPickExisting(s)} className="rounded-full border border-line px-3 py-1.5 hover:bg-surface-3">
                  {exerciseLabel(s)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Field label="Variant (optional)" hint="Tell apart specific machines, e.g. “Hammer Strength, Riverside gym”. Separate exercises keep separate histories.">
        {(id, d) => <Input id={id} aria-describedby={d} value={variant} onChange={(e) => setVariant(e.target.value)} maxLength={80} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Muscle">
          {(id) => (
            <select id={id} className={inputClass} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
              {MUSCLES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
          )}
        </Field>
        <Field label="Equipment">
          {(id) => (
            <select id={id} className={inputClass} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              {EQUIPMENT.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
          )}
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-muted">Tracking</legend>
        {TRACKING_MODES.map((t) => (
          <label key={t.value} className={cx("flex cursor-pointer gap-3 rounded-2xl border p-3", mode === t.value ? "border-accent-text/60 bg-accent-soft" : "border-line")}>
            <input type="radio" name="mode" value={t.value} checked={mode === t.value} onChange={() => setMode(t.value)} className="mt-1 accent-[var(--accent)]" />
            <span>
              <span className="block font-medium">{t.label}</span>
              <span className="block text-sm text-muted">{t.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onCancel} className="flex-1">Back</Button>
        <Button type="submit" variant="primary" busy={busy} className="flex-1">Create exercise</Button>
      </div>
    </form>
  );
}
