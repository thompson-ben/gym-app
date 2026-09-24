"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { validateCompletion, type CompleteError } from "@/lib/session/doc";
import { matchPrevious } from "@/lib/session/previous";
import { formatDate, formatSet, formatShortDate, formatTargetLong, weightLabel } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PreviousPerformance, SessionExercise, SessionSet, SetType } from "@/lib/types";
import { IconArrowUpRight, IconChevronDown, IconHistory, IconMore, IconPlus } from "../icons";
import { cx } from "../styles";
import { Button, IconButton, Spinner } from "../ui";
import { GRID_REPS_ONLY, GRID_WITH_WEIGHT, SetRow, type SetRowHandle } from "./SetRow";

type HistoryEntry = { session_id: string; completed_at: string; template_name: string; split_name: string | null; sets: PreviousPerformance["sets"] };

const COMPLETE_HINT: Record<CompleteError, string> = {
  reps_required: "Enter reps to confirm this set.",
  weight_required: "Enter a weight to confirm this set.",
  invalid: "Check the values for this set.",
};

export function ExerciseCard({
  entry,
  previous,
  timeZone,
  onSetChange,
  onComplete,
  onUncomplete,
  onAddSet,
  onOpenMenu,
  onOpenSetMenu,
  onUnskip,
}: {
  entry: SessionExercise;
  previous: PreviousPerformance | undefined;
  timeZone: string;
  onSetChange: (setId: string, patch: Partial<Pick<SessionSet, "weight_kg" | "reps">>) => void;
  onComplete: (setId: string) => void;
  onUncomplete: (setId: string) => void;
  onAddSet: (type: SetType) => void;
  onOpenMenu: () => void;
  onOpenSetMenu: (set: SessionSet, ordinal: string) => void;
  onUnskip: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const rows = useRef(new Map<string, SetRowHandle>());
  const matched = matchPrevious(entry.sets, previous?.sets);
  const mode = entry.tracking_mode;
  const target = formatTargetLong(entry.target_sets, entry.rep_min, entry.rep_max);
  const done = entry.sets.filter((s) => s.completed_at).length;
  let workingIndex = 0;
  let warmupIndex = 0;

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (!next || history) return;
    setHistoryError(null);
    const { data, error } = await supabaseBrowser().rpc("exercise_history", { p_exercise_id: entry.exercise_id });
    if (error) setHistoryError(navigator.onLine ? "Could not load history." : "History needs a connection. Last session is shown in the Previous column.");
    else setHistory((data as HistoryEntry[]).slice(0, 6));
  }

  function tryComplete(set: SessionSet) {
    if (set.completed_at) {
      onUncomplete(set.id);
      setHint(null);
      return;
    }
    const result = validateCompletion(entry, set);
    if ("error" in result) {
      setHint(COMPLETE_HINT[result.error]);
      const row = rows.current.get(set.id);
      if (result.error === "weight_required") row?.focusWeight();
      else row?.focusReps();
      return;
    }
    setHint(null);
    onComplete(set.id);
  }

  if (entry.skipped && done === 0) {
    return (
      <section aria-label={entry.exercise_name} className="flex items-center justify-between gap-3 rounded-3xl border border-dashed border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-muted line-through decoration-faint">{entry.exercise_name}</h3>
          <p className="text-sm text-faint">Skipped this session</p>
        </div>
        <Button size="sm" variant="quiet" onClick={onUnskip}>Undo</Button>
      </section>
    );
  }

  return (
    <section aria-label={entry.exercise_name} className="rounded-3xl border border-line bg-surface p-3 min-[380px]:p-4 sm:p-5">
      <header className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[20px] leading-snug font-medium tracking-[-0.01em]">{entry.exercise_name}</h3>
          <p className="mt-0.5 text-[15px] text-muted">
            {target}
            {entry.skipped ? <span className="text-warn"> · Skipped</span> : null}
          </p>
          {previous ? (
            <Link
              href={`/progress/${entry.exercise_id}`}
              className="mt-3 inline-flex items-center gap-1 text-[15px] text-accent-text underline-offset-4 hover:underline"
              aria-label={`Last performed ${formatDate(previous.completed_at, timeZone)} in ${previous.template_name}. Open full history`}
            >
              Last: {formatShortDate(previous.completed_at, timeZone)} · {previous.template_name}
              <IconArrowUpRight size={15} />
            </Link>
          ) : (
            <p className="mt-3 text-[15px] text-faint">First time logging this exercise. No previous sets yet.</p>
          )}
        </div>
        <IconButton label={`${entry.exercise_name} options`} onClick={onOpenMenu} className="-mt-1 -mr-2">
          <IconMore />
        </IconButton>
      </header>

      {entry.template_notes ? <p className="mx-1 mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{entry.template_notes}</p> : null}
      {entry.notes ? <p className="mx-1 mt-2 text-sm text-muted italic">Note: {entry.notes}</p> : null}

      <div className="mt-5">
        <div className={cx(mode === "bodyweight_reps" ? GRID_REPS_ONLY : GRID_WITH_WEIGHT, "pb-2 text-[14px] font-medium text-muted")} aria-hidden="true">
          <span className="text-center">Set</span>
          <span className="text-center">Previous</span>
          {mode !== "bodyweight_reps" ? <span className="text-center">{weightLabel(mode)}</span> : null}
          <span className="text-center">Reps</span>
          <span className="text-center">Done</span>
        </div>
        <div className="space-y-2">
          {entry.sets.map((set, i) => {
            const isWarmup = set.set_type === "warmup";
            const n = isWarmup ? ++warmupIndex : ++workingIndex;
            const ordinal = isWarmup ? `warm-up set ${n}` : `set ${n}`;
            return (
              <SetRow
                key={set.id}
                ref={(handle) => {
                  if (handle) rows.current.set(set.id, handle);
                  else rows.current.delete(set.id);
                }}
                set={set}
                label={isWarmup ? `W${n > 1 ? n : ""}` : String(n)}
                ordinal={ordinal}
                previous={matched[i]}
                mode={mode}
                exerciseName={entry.exercise_name}
                onChange={(patch) => onSetChange(set.id, patch)}
                onToggleDone={() => tryComplete(set)}
                onOpenMenu={() => onOpenSetMenu(set, ordinal)}
              />
            );
          })}
        </div>
        {hint ? <p role="alert" className="mt-2 px-1 text-sm text-warn">{hint}</p> : null}
        {mode === "added_weight_reps" ? <p className="mt-2 px-1 text-xs text-faint">+kg is load added to your bodyweight. Leave 0 for bodyweight only.</p> : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Button size="sm" variant="quiet" onClick={() => onAddSet("working")}>
          <IconPlus size={16} /> Add set
        </Button>
        <Button size="sm" variant="quiet" onClick={toggleHistory} aria-expanded={historyOpen}>
          <IconHistory size={16} /> History
          <IconChevronDown size={16} className={cx("transition", historyOpen && "rotate-180")} />
        </Button>
      </div>

      {historyOpen ? (
        <div className="mt-2 border-t border-line px-1 pt-3">
          {historyError ? <p className="text-sm text-muted">{historyError}</p> : null}
          {!history && !historyError ? <div className="flex justify-center py-3 text-muted"><Spinner /></div> : null}
          {history && history.length === 0 ? <p className="text-sm text-muted">No completed sessions for this exercise yet.</p> : null}
          {history && history.length > 0 ? (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.session_id}>
                  <p className="text-sm">
                    <span className="font-medium">{formatDate(h.completed_at, timeZone)}</span>{" "}
                    <span className="text-muted">· {h.template_name}{h.split_name ? ` · ${h.split_name}` : ""}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted tabular">
                    {h.sets.map((s, i) => (
                      <span key={i} className={cx("mr-3 inline-block", s.set_type === "warmup" && "text-faint")}>
                        {s.set_type === "warmup" ? "W " : ""}
                        {formatSet(mode, s.weight_kg, s.reps)}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
          <Link href={`/progress/${entry.exercise_id}`} className="mt-3 inline-block text-sm font-medium text-accent-text">
            Full history and progress
          </Link>
        </div>
      ) : null}
    </section>
  );
}
