"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeSet, toPayload, updateSet } from "@/lib/session/doc";
import { formatDate, formatSet, formatTarget, weightLabel } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { SessionDoc } from "@/lib/types";
import { isValidNumber, parseReps, parseWeight } from "@/lib/validation";
import { IconCheck, IconPlus, IconTrash } from "./icons";
import { cx } from "./styles";
import { Button, ErrorNote, IconButton, PageHeader } from "./ui";

export function SessionView({ doc: initial, timeZone, justFinished }: { doc: SessionDoc; timeZone: string; justFinished: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duration = doc.completed_at ? (new Date(doc.completed_at).getTime() - new Date(doc.started_at).getTime()) / 1000 : 0;
  const totalSets = doc.exercises.reduce((n, e) => n + e.sets.length, 0);

  async function save() {
    for (const ex of doc.exercises) {
      for (const s of ex.sets) {
        if (!isValidNumber(s.reps) || s.reps < 1) return setError(`Enter reps for every set of ${ex.exercise_name}.`);
        if (ex.tracking_mode === "weight_reps" && !isValidNumber(s.weight_kg)) return setError(`Enter a weight for every set of ${ex.exercise_name}.`);
      }
    }
    if (!doc.exercises.some((e) => e.sets.length)) return setError("A completed workout needs at least one set.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("sync_session", {
      p_session_id: doc.id,
      p_base_revision: doc.revision,
      p_write_id: crypto.randomUUID(),
      p_doc: toPayload(doc),
    });
    setBusy(false);
    if (error) return setError(friendlyError(error, "Could not save changes."));
    if (data.status === "conflict") return setError("This workout was changed elsewhere. Reload the page to see the latest version.");
    setDoc({ ...doc, revision: data.revision });
    setEditing(false);
    router.refresh();
  }

  function addSet(exId: string) {
    setDoc((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        if (e.id !== exId) return e;
        const last = e.sets.at(-1);
        return {
          ...e,
          skipped: false,
          sets: [...e.sets, { id: crypto.randomUUID(), position: e.sets.length, set_type: "working", weight_kg: last?.weight_kg ?? null, reps: null, completed_at: d.completed_at }],
        };
      }),
    }));
  }

  return (
    <>
      <PageHeader
        back={{ href: "/progress", label: "Progress" }}
        eyebrow={[doc.split_name, doc.completed_at ? formatDate(doc.completed_at, timeZone, { weekday: "long" }) : null].filter(Boolean).join(" · ")}
        title={doc.template_name}
        action={
          editing ? (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => { setDoc(initial); setEditing(false); setError(null); }}>Cancel</Button>
              <Button size="sm" variant="primary" busy={busy} onClick={save}>Save</Button>
            </div>
          ) : (
            <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>Edit</Button>
          )
        }
      />
      {justFinished ? (
        <div className="-mt-2 mb-5 flex items-center gap-3 rounded-3xl bg-accent-soft p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink"><IconCheck /></span>
          <div>
            <p className="font-semibold">Workout saved</p>
            <p className="text-sm text-muted">{totalSets} sets · {Math.round(duration / 60)} min</p>
          </div>
        </div>
      ) : (
        <p className="-mt-3 mb-5 text-sm text-muted">{totalSets} sets · {Math.round(duration / 60)} min</p>
      )}
      <ErrorNote>{error}</ErrorNote>
      {doc.notes ? <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{doc.notes}</p> : null}

      <div className="space-y-3">
        {doc.exercises.map((ex) => {
          let n = 0;
          return (
            <section key={ex.id} className="rounded-3xl border border-line bg-surface p-4" aria-label={ex.exercise_name}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/progress/${ex.exercise_id}`} className="hover:underline underline-offset-4">{ex.exercise_name}</Link>
                </h2>
                <span className="shrink-0 text-sm text-muted">{formatTarget(ex.target_sets, ex.rep_min, ex.rep_max)}</span>
              </div>
              {ex.notes ? <p className="mt-1 text-sm text-muted italic">{ex.notes}</p> : null}
              {ex.sets.length === 0 ? (
                <p className="mt-2 text-sm text-faint">{ex.skipped ? "Skipped" : "Not performed"}</p>
              ) : editing ? (
                <div className="mt-3 space-y-2">
                  {ex.sets.map((s) => {
                    const label = s.set_type === "warmup" ? "W" : String(++n);
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="w-8 text-center text-sm text-muted">{label}</span>
                        {ex.tracking_mode !== "bodyweight_reps" ? (
                          <EditNumber
                            label={`${ex.exercise_name} set ${label} ${weightLabel(ex.tracking_mode)}`}
                            value={s.weight_kg}
                            parse={parseWeight}
                            suffix={weightLabel(ex.tracking_mode)}
                            onChange={(v) => setDoc((d) => updateSet(d, ex.id, s.id, { weight_kg: v }))}
                          />
                        ) : null}
                        <EditNumber
                          label={`${ex.exercise_name} set ${label} reps`}
                          value={s.reps}
                          parse={parseReps}
                          suffix="reps"
                          onChange={(v) => setDoc((d) => updateSet(d, ex.id, s.id, { reps: v }))}
                        />
                        <IconButton label={`Remove set ${label}`} onClick={() => setDoc((d) => removeSet(d, ex.id, s.id))}><IconTrash size={18} /></IconButton>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="quiet" onClick={() => addSet(ex.id)}><IconPlus size={16} /> Add set</Button>
                </div>
              ) : (
                <ol className="mt-2 flex flex-wrap gap-2">
                  {ex.sets.map((s) => {
                    const label = s.set_type === "warmup" ? "W" : String(++n);
                    return (
                      <li key={s.id} className={cx("rounded-xl bg-surface-2 px-3 py-1.5 text-sm tabular", s.set_type === "warmup" && "text-faint")}>
                        <span className="mr-2 text-muted">{label}</span>
                        {formatSet(ex.tracking_mode, s.weight_kg, s.reps)}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      {editing ? null : <p className="mt-6 text-center text-xs text-faint">Names and targets are as they were when this workout was logged.</p>}
    </>
  );
}

function EditNumber({ label, value, parse, suffix, onChange }: { label: string; value: number | null; parse: (s: string) => number | null; suffix: string; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const parsed = parse(text);
  const invalid = parsed !== null && !isValidNumber(parsed);
  return (
    <label className="relative flex-1">
      <span className="sr-only">{label}</span>
      <input
        inputMode={suffix === "reps" ? "numeric" : "decimal"}
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = parse(e.target.value);
          if (v === null || isValidNumber(v)) onChange(v);
        }}
        className={cx("h-11 w-full rounded-xl border bg-surface-2 pr-12 pl-3 text-[16px] tabular outline-none focus:ring-2 focus:ring-[var(--ring)]", invalid ? "border-danger" : "border-transparent")}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-faint">{suffix}</span>
    </label>
  );
}
