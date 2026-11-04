"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EXERCISE_COLUMNS, exerciseLabel } from "@/lib/exercises";
import { formatDate } from "@/lib/format";
import {
  ImportFileError,
  SOURCE_LABEL,
  importBatches,
  parseExport,
  planImport,
  resolveExerciseKeys,
  type ImportPlan,
  type ParsedFile,
} from "@/lib/import";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { Exercise } from "@/lib/types";
import type { WeightUnit } from "@/lib/units";
import { IconChevronRight } from "./icons";
import { Button, ErrorNote, Sheet, cx } from "./ui";

type Step =
  | { kind: "choose" }
  | { kind: "review"; csv: string; file: ParsedFile; plan: ImportPlan; unit: WeightUnit }
  | { kind: "importing"; done: number; total: number }
  | { kind: "finished"; imported: number; skipped: number };

/**
 * Profile → Your data → Import from Strong or Hevy. The file is read on the device; nothing is
 * saved until the member has seen what will be imported and taps Import.
 */
export function ImportHistoryRow({ unit }: { unit: WeightUnit }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const exercises = useRef<Exercise[] | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function loadExercises(): Promise<Exercise[]> {
    if (exercises.current) return exercises.current;
    const { data, error: e } = await supabaseBrowser().from("exercises").select(EXERCISE_COLUMNS).is("archived_at", null);
    if (e) throw e;
    exercises.current = (data ?? []) as Exercise[];
    return exercises.current;
  }

  async function review(csv: string, fileUnit: WeightUnit) {
    const file = parseExport(csv, fileUnit);
    const plan = planImport(file, await loadExercises());
    if (!plan.sessions.length) throw new ImportFileError("No finished workouts with sets were found in this file.");
    setStep({ kind: "review", csv, file, plan, unit: fileUnit });
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    setError(null);
    setReading(true);
    try {
      if (f.size > 20 * 1024 * 1024) throw new ImportFileError("That file is larger than 20 MB. Is it the CSV export?");
      await review(await f.text(), unit);
    } catch (e) {
      setError(e instanceof ImportFileError ? e.message : friendlyError(e as Error, "That file couldn’t be read. Please try again."));
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function run(plan: ImportPlan) {
    setError(null);
    const supabase = supabaseBrowser();
    const batches = importBatches(plan);
    const ids: Record<string, string> = {};
    let imported = 0;
    let skipped = 0;
    setStep({ kind: "importing", done: 0, total: plan.sessions.length });
    try {
      for (const batch of batches) {
        const { data, error: e } = await supabase.rpc("import_workouts", {
          p_source: plan.source,
          p_exercises: batch.exercises,
          p_sessions: resolveExerciseKeys(batch.sessions, ids),
        });
        if (e) throw e;
        const result = data as { imported: number; skipped: number; exercises: Record<string, string> };
        Object.assign(ids, result.exercises);
        imported += result.imported;
        skipped += result.skipped;
        setStep({ kind: "importing", done: imported + skipped, total: plan.sessions.length });
      }
      exercises.current = null;
      setStep({ kind: "finished", imported, skipped });
      router.refresh();
    } catch (e) {
      // Workouts already sent are kept; trying again skips them.
      setStep({ kind: "choose" });
      setError(
        `${friendlyError(e as Error, "The import stopped part-way.")}${imported ? ` ${imported} workout${imported === 1 ? " was" : "s were"} imported; choosing the file again carries on from there.` : ""}`,
      );
    }
  }

  const close = () => {
    if (step.kind === "importing") return;
    setOpen(false);
    setStep({ kind: "choose" });
    setError(null);
    setShowAll(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Import from Strong or Hevy</span>
          <span className="block text-sm text-muted">Bring your workout history with you.</span>
        </span>
        <IconChevronRight className="shrink-0 text-faint" />
      </button>

      <Sheet
        open={open}
        onClose={close}
        title={step.kind === "finished" ? "History imported" : "Import your history"}
        footer={
          step.kind === "review" ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" className="flex-1" onClick={() => setStep({ kind: "choose" })}>Back</Button>
              <Button size="lg" className="flex-1" onClick={() => void run(step.plan)}>
                Import {step.plan.sessions.length} workout{step.plan.sessions.length === 1 ? "" : "s"}
              </Button>
            </div>
          ) : step.kind === "importing" ? (
            <Button size="lg" className="w-full" busy disabled>Importing…</Button>
          ) : step.kind === "finished" ? (
            <Button size="lg" className="w-full" onClick={close}>Done</Button>
          ) : (
            <Button size="lg" className="w-full" busy={reading} onClick={() => input.current?.click()}>Choose CSV file</Button>
          )
        }
      >
        <input ref={input} type="file" accept=".csv,text/csv,text/comma-separated-values" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />

        {step.kind === "choose" ? (
          <div className="space-y-4 text-muted">
            <p>Export your workouts as a CSV file, then choose it here. Setmodo matches each exercise to its own list, so your last sets, records and progress carry straight on.</p>
            <ul className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
              <li><span className="font-medium text-fg">Strong:</span> Settings → Export Strong data</li>
              <li><span className="font-medium text-fg">Hevy:</span> Settings → Export &amp; import data → Export workouts</li>
            </ul>
            <p className="text-sm">Importing the same file again won’t duplicate anything.</p>
          </div>
        ) : null}

        {step.kind === "review" ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-lg font-semibold">
                {step.plan.sessions.length.toLocaleString("en-GB")} workout{step.plan.sessions.length === 1 ? "" : "s"} · {step.plan.sets.toLocaleString("en-GB")} sets
              </p>
              <p className="text-sm text-muted">
                From {SOURCE_LABEL[step.plan.source]}
                {step.plan.first && step.plan.last ? `, ${formatDate(step.plan.first.toISOString())} to ${formatDate(step.plan.last.toISOString())}` : ""}
              </p>
            </div>

            {!step.file.unitInFile ? (
              <div>
                <p id="import-unit-label" className="text-sm font-medium text-muted">Weights in this file are in</p>
                <div role="radiogroup" aria-labelledby="import-unit-label" className="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
                  {(["kg", "lb"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      role="radio"
                      aria-checked={step.unit === u}
                      onClick={() => review(step.csv, u).catch((e) => setError(friendlyError(e as Error)))}
                      className={cx("h-11 rounded-xl text-sm font-medium transition-colors", step.unit === u ? "bg-accent text-accent-ink" : "text-muted hover:text-fg")}
                    >
                      {u === "kg" ? "Kilograms (kg)" : "Pounds (lb)"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="text-sm font-medium text-muted">
                {step.plan.exercises.length} exercises
                {step.plan.newExercises.length ? `, ${step.plan.newExercises.length} added as your own` : ""}
              </p>
              <ul className="mt-1.5 divide-y divide-line rounded-2xl border border-line text-sm">
                {(showAll ? step.plan.exercises : step.plan.exercises.slice(0, 8)).map((e) => (
                  <li key={e.name} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.match ? exerciseLabel(e.match) : e.name}</span>
                      <span className="block truncate text-xs text-faint">{e.match ? (e.match.name === e.name ? "Matched" : `Was “${e.name}”`) : "New exercise"}</span>
                    </span>
                    <span className="shrink-0 text-faint">{e.sets} sets</span>
                  </li>
                ))}
              </ul>
              {step.plan.exercises.length > 8 && !showAll ? (
                <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-sm text-accent-text underline underline-offset-4">
                  Show all {step.plan.exercises.length}
                </button>
              ) : null}
            </div>

            {step.plan.skippedCardio.length ? (
              <p className="text-sm text-muted">Cardio isn’t tracked in Setmodo, so {step.plan.skippedCardio.join(", ")} won’t be imported.</p>
            ) : null}
            <p className="text-sm text-muted">You can rename or edit new exercises afterwards from their page in Progress.</p>
          </div>
        ) : null}

        {step.kind === "importing" ? (
          <div className="space-y-3" role="status">
            <p className="text-muted">Importing {step.done.toLocaleString("en-GB")} of {step.total.toLocaleString("en-GB")} workouts. Keep this screen open.</p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${step.total ? Math.round((step.done / step.total) * 100) : 0}%` }} />
            </div>
          </div>
        ) : null}

        {step.kind === "finished" ? (
          <div className="space-y-3 text-muted" role="status">
            <p>
              {step.imported.toLocaleString("en-GB")} workout{step.imported === 1 ? "" : "s"} imported.
              {step.skipped ? ` ${step.skipped.toLocaleString("en-GB")} ${step.skipped === 1 ? "was" : "were"} already here.` : ""}
            </p>
            <p>Your last sets now show beside every matching exercise, and Progress has the full history.</p>
          </div>
        ) : null}

        <ErrorNote>{error}</ErrorNote>
      </Sheet>
    </>
  );
}
