"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeSet, toPayload, updateSet } from "@/lib/session/doc";
import { formatDate, formatMinutes, formatSet, formatTarget, weightLabel } from "@/lib/format";
import { formatTargetSets } from "@/lib/progression";
import type { PersonalRecord } from "@/lib/records";
import type { TargetMap } from "@/lib/targets";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { SessionDoc } from "@/lib/types";
import { isValidNumber, parseReps, parseWeight } from "@/lib/validation";
import { IconCheck, IconPlus, IconTrash } from "./icons";
import { cx } from "./styles";
import { Button, ErrorNote, IconButton, PageHeader } from "./ui";
import { WorkoutDateSheet } from "./WorkoutDateSheet";

export type SessionInsights = {
  byExercise: Record<string, { records: PersonalRecord[]; change: string | null } | undefined>;
  nextTargets: TargetMap;
  firstWorkout: boolean;
  durationMinutes: number | null;
};

export function SessionView({
  doc: initial,
  timeZone,
  justFinished,
  insights,
}: {
  doc: SessionDoc;
  timeZone: string;
  justFinished: boolean;
  insights: SessionInsights;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const workingSets = doc.exercises.reduce((n, e) => n + e.sets.filter((s) => s.set_type === "working").length, 0);
  const performed = doc.exercises.filter((e) => e.sets.some((s) => s.set_type === "working"));
  const stats = [
    `${performed.length} ${performed.length === 1 ? "exercise" : "exercises"}`,
    `${workingSets} working ${workingSets === 1 ? "set" : "sets"}`,
    insights.durationMinutes ? formatMinutes(insights.durationMinutes) : doc.is_backdated ? "logged afterwards" : null,
  ].filter(Boolean).join(" · ");
  const records = performed.flatMap((e) => (insights.byExercise[e.exercise_id]?.records ?? []).map((r) => ({ ...r, exercise: e.exercise_name, id: e.exercise_id })));
  const seen = new Set<string>();
  const uniqueRecords = records.filter((r) => (seen.has(r.id + r.kind) ? false : (seen.add(r.id + r.kind), true)));
  const baselines = uniqueRecords.filter((r) => r.kind === "first");
  const prs = uniqueRecords.filter((r) => r.kind !== "first");
  const targets = doc.exercises
    .map((e) => ({ e, t: insights.nextTargets[e.id] }))
    .filter((x): x is { e: (typeof doc.exercises)[number]; t: NonNullable<typeof x.t> & { target: NonNullable<NonNullable<typeof x.t>["target"]> } } => Boolean(x.t?.target));

  async function changeDate(iso: string): Promise<string | null> {
    const { data, error } = await supabaseBrowser().rpc("set_session_date", { p_session_id: doc.id, p_performed_at: iso });
    if (error) return friendlyError(error, "Could not change the date.");
    setDoc((d) => ({ ...d, started_at: data.started_at, completed_at: data.completed_at }));
    setDateOpen(false);
    router.refresh();
    return null;
  }

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
        back={{ href: "/history", label: "History" }}
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
        <div className="-mt-2 mb-4 flex items-center gap-3 rounded-3xl bg-accent-soft p-4" role="status">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"><IconCheck /></span>
          <div>
            <p className="font-semibold">Workout saved</p>
            <p className="text-sm text-muted">
              {stats}
              {doc.is_backdated && doc.completed_at ? ` · saved for ${formatDate(doc.completed_at, timeZone, { weekday: "long", year: undefined })}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="-mt-3 mb-4 text-sm text-muted">{stats}</p>
      )}
      {justFinished && insights.firstWorkout ? (
        <p className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Your first workout is logged. Next time you do these exercises, today’s sets appear in the Previous column so you know what to aim for.
        </p>
      ) : null}

      {!editing && (prs.length || baselines.length) ? (
        <section aria-labelledby="records-title" className="mb-4 rounded-3xl border border-line bg-surface p-4">
          <h2 id="records-title" className="text-sm font-medium tracking-wide text-muted uppercase">Records</h2>
          {prs.length ? (
            <ul className="mt-2 space-y-2">
              {prs.map((r) => (
                <li key={r.id + r.kind} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-accent-text">★</span>
                  <span>
                    <span className="font-medium">{r.exercise}</span>
                    <span className="block text-sm text-muted">{r.label}: {r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {baselines.length ? (
            <p className="mt-2 text-sm text-muted">
              First recorded performance{baselines.length === 1 ? "" : "s"}: {baselines.map((b) => b.exercise).join(", ")}. Your baseline is set.
            </p>
          ) : null}
          <details className="mt-2 text-sm text-faint">
            <summary className="cursor-pointer py-1">How records are defined</summary>
            <p className="mt-1">
              Working sets only, compared with every earlier workout. Heaviest load: more weight than ever before. Rep record: more reps at a weight you have
              lifted before. Estimated 1RM: Epley estimate from sets of 12 reps or fewer; an estimate, not a tested max. Ties are not records.
            </p>
          </details>
        </section>
      ) : null}
      {editing ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-sm text-muted">Workout date</p>
            <p className="font-medium">{doc.completed_at ? formatDate(doc.completed_at, timeZone, { weekday: "long", hour: "2-digit", minute: "2-digit" }) : ""}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setDateOpen(true)}>Change date</Button>
        </div>
      ) : null}
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
              {!editing && insights.byExercise[ex.exercise_id]?.change && ex.sets.some((x) => x.set_type === "working") ? (
                <p className="mt-0.5 text-sm text-muted">vs last time: {insights.byExercise[ex.exercise_id]!.change}</p>
              ) : null}
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
      {!editing && targets.length ? (
        <section aria-labelledby="next-title" className="mt-4 rounded-3xl border border-dashed border-accent-text/50 p-4">
          <h2 id="next-title" className="text-sm font-medium tracking-wide text-accent-text uppercase">Next time</h2>
          <ul className="mt-2 space-y-2">
            {targets.map(({ e, t }) => (
              <li key={e.id}>
                <span className="font-medium">{e.exercise_name}</span>
                <span className="ml-2 tabular">{formatTargetSets(t.target)}</span>
                <span className="block text-sm text-muted">{t.target.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">Suggestions only. They show beside Previous next time and never count as sets.</p>
        </section>
      ) : null}
      {editing ? null : <p className="mt-6 text-center text-xs text-faint">Names and targets are as they were when this workout was logged.</p>}
      <WorkoutDateSheet
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        title="Workout date"
        description="Move this workout to the date and time it was performed. History and Previous follow the new date."
        initialIso={doc.completed_at ?? doc.started_at}
        confirmLabel="Save date"
        onConfirm={changeDate}
      />
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
