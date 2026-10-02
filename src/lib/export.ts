import type { SetType, TrackingMode } from "./types";

/** One completed workout as loaded for export (names are the session's own snapshot). */
export type ExportSession = {
  id: string;
  performed_at: string;
  workout: string;
  split: string | null;
  backdated: boolean;
  notes: string | null;
  exercises: {
    exercise_id: string;
    name: string;
    tracking_mode: TrackingMode;
    position: number;
    skipped: boolean;
    notes: string | null;
    sets: { position: number; set_type: SetType; weight_kg: number | null; reps: number | null; completed_at: string | null }[];
  }[];
};

export const CSV_HEADER = [
  "date",
  "time",
  "workout",
  "split",
  "exercise",
  "set_number",
  "set_type",
  "weight_kg",
  "reps",
  "weight_meaning",
  "logged_afterwards",
  "session_id",
] as const;

/**
 * Quotes a CSV field when needed and neutralises spreadsheet formulas: user-entered names
 * starting with = + - @ would otherwise run as formulas when opened in Excel or Sheets.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const MEANING: Record<TrackingMode, string> = {
  weight_reps: "load",
  added_weight_reps: "added to bodyweight",
  bodyweight_reps: "",
};

/** Local date and time (yyyy-mm-dd, hh:mm) of a timestamp in a time zone. */
function localParts(iso: string, timeZone: string): [string, string] {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return [`${g("year")}-${g("month")}-${g("day")}`, `${g("hour")}:${g("minute")}`];
}

/**
 * One row per completed set, oldest workout first, sets in the order logged. Working sets are
 * numbered 1, 2, 3…; warm-ups are numbered separately. Unconfirmed sets are never exported.
 */
export function sessionsToCsv(sessions: ExportSession[], timeZone: string): string {
  const lines = [CSV_HEADER.join(",")];
  for (const s of [...sessions].sort((a, b) => a.performed_at.localeCompare(b.performed_at))) {
    const [date, time] = localParts(s.performed_at, timeZone);
    for (const e of [...s.exercises].sort((a, b) => a.position - b.position)) {
      const counters: Record<SetType, number> = { working: 0, warmup: 0 };
      for (const set of [...e.sets].sort((a, b) => a.position - b.position)) {
        if (!set.completed_at || set.reps === null) continue;
        const n = ++counters[set.set_type];
        lines.push(
          [
            date,
            time,
            s.workout,
            s.split,
            e.name,
            n,
            set.set_type === "warmup" ? "warm-up" : "working",
            e.tracking_mode === "bodyweight_reps" ? null : (set.weight_kg ?? 0),
            set.reps,
            MEANING[e.tracking_mode],
            s.backdated ? "yes" : "no",
            s.id,
          ]
            .map(csvField)
            .join(","),
        );
      }
    }
  }
  // Excel needs a byte-order mark to read UTF-8 (e.g. "×", accented names) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
