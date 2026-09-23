"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatKg, formatSet } from "@/lib/format";
import type { PreviousSet, SessionSet, TrackingMode } from "@/lib/types";
import { isValidNumber, parseReps, parseWeight } from "@/lib/validation";
import { IconCheck } from "../icons";
import { cx } from "../styles";

export type SetRowHandle = { focusWeight: () => void; focusReps: () => void };

type Props = {
  set: SessionSet;
  label: string;
  ordinal: string;
  previous: PreviousSet | null;
  mode: TrackingMode;
  exerciseName: string;
  onChange: (patch: Partial<Pick<SessionSet, "weight_kg" | "reps">>) => void;
  onToggleDone: () => void;
  onOpenMenu: () => void;
};

export const GRID_WITH_WEIGHT = "grid grid-cols-[2.25rem_minmax(0,1fr)_4.25rem_3.75rem_2.75rem] items-center gap-1.5 sm:gap-2";
export const GRID_REPS_ONLY = "grid grid-cols-[2.25rem_minmax(0,1fr)_3.75rem_2.75rem] items-center gap-1.5 sm:gap-2";

const numberInput =
  "h-11 w-full rounded-xl border bg-surface-2 text-center text-[17px] font-medium tabular text-fg outline-none transition placeholder:text-faint placeholder:font-normal focus:ring-2 focus:ring-[var(--ring)]";

/** Edits a numeric value while typing; only valid values reach the session document. */
function useNumberField(value: number | null, parse: (s: string) => number | null, format: (n: number | null) => string) {
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (!focused && value !== lastValue) {
    setLastValue(value);
    setText(format(value));
  }
  const parsed = parse(text);
  const invalid = parsed !== null && !isValidNumber(parsed);
  return { text, setText, focused, setFocused, invalid, parsed };
}

export const SetRow = forwardRef<SetRowHandle, Props>(function SetRow(
  { set, label, ordinal, previous, mode, exerciseName, onChange, onToggleDone, onOpenMenu },
  ref,
) {
  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focusWeight: () => weightRef.current?.focus(),
    focusReps: () => repsRef.current?.focus(),
  }));
  const done = Boolean(set.completed_at);
  const weight = useNumberField(set.weight_kg, parseWeight, (n) => formatKg(n));
  const reps = useNumberField(set.reps, parseReps, (n) => (n === null ? "" : String(n)));
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [flash]);

  const showWeight = mode !== "bodyweight_reps";
  const setName = `${exerciseName}, ${ordinal}`;

  return (
    <div
      className={cx(showWeight ? GRID_WITH_WEIGHT : GRID_REPS_ONLY, "rounded-2xl px-1 py-1 transition-colors", done && "bg-accent-soft")}
      role="group"
      aria-label={setName}
    >
      <button
        type="button"
        onClick={onOpenMenu}
        className={cx(
          "h-11 rounded-xl text-sm font-semibold tabular transition hover:bg-surface-3",
          set.set_type === "warmup" ? "text-warn" : done ? "text-accent-text" : "text-muted",
        )}
        aria-label={`${ordinal} options`}
      >
        {label}
      </button>
      <div className="min-w-0 truncate text-center text-[13px] text-muted tabular" aria-label={previous ? `Previous: ${formatSet(mode, previous.weight_kg, previous.reps)}` : "No previous set"}>
        {previous ? formatSet(mode, previous.weight_kg, previous.reps) : <span className="text-faint">—</span>}
      </div>
      {showWeight ? (
        <input
          ref={weightRef}
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          aria-label={`${setName} ${mode === "added_weight_reps" ? "added weight in kg" : "weight in kg"}`}
          aria-invalid={weight.invalid || undefined}
          placeholder={mode === "added_weight_reps" ? "0" : "kg"}
          value={weight.text}
          onFocus={(e) => { weight.setFocused(true); e.currentTarget.select(); }}
          onBlur={() => {
            weight.setFocused(false);
            if (weight.invalid) weight.setText(formatKg(set.weight_kg));
          }}
          onChange={(e) => {
            weight.setText(e.target.value);
            const v = parseWeight(e.target.value);
            if (v === null || isValidNumber(v)) onChange({ weight_kg: v });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              repsRef.current?.focus();
            }
          }}
          className={cx(numberInput, weight.invalid ? "border-danger" : "border-transparent")}
        />
      ) : null}
      <input
        ref={repsRef}
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        aria-label={`${setName} reps`}
        aria-invalid={reps.invalid || undefined}
        placeholder={previous ? String(previous.reps) : "reps"}
        value={reps.text}
        onFocus={(e) => { reps.setFocused(true); e.currentTarget.select(); }}
        onBlur={() => {
          reps.setFocused(false);
          if (reps.invalid) reps.setText(set.reps === null ? "" : String(set.reps));
        }}
        onChange={(e) => {
          reps.setText(e.target.value);
          const v = parseReps(e.target.value);
          if (v === null || isValidNumber(v)) onChange({ reps: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!done) onToggleDone();
            e.currentTarget.blur();
          }
        }}
        className={cx(numberInput, reps.invalid ? "border-danger" : "border-transparent")}
      />
      <button
        type="button"
        onClick={() => {
          if (!done) setFlash(true);
          onToggleDone();
        }}
        aria-pressed={done}
        aria-label={done ? `${setName} completed. Tap to undo` : `Confirm ${setName}`}
        className={cx(
          "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition",
          done ? "border-accent bg-accent text-accent-ink" : "border-surface-3 text-faint hover:border-muted hover:text-muted",
          flash && "scale-105",
        )}
      >
        <IconCheck size={20} strokeWidth={done ? 3 : 2} />
      </button>
    </div>
  );
});
