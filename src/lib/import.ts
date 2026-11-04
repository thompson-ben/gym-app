/**
 * Bringing history over from Strong or Hevy: their CSV exports are read in the browser
 * (dates stay in the member's local time), each exercise is matched to the catalogue or the
 * member's own exercises, and finished workouts are sent to `import_workouts` in batches.
 *
 * Matching is deliberately cautious: a wrong match would mix two lifts' history, so anything
 * not clearly one exercise becomes a custom exercise with the name it had in the other app.
 * Pure and unit-tested.
 */

import type { Exercise, TrackingMode } from "./types";
import { KG_PER_LB, MAX_WEIGHT_KG, type WeightUnit } from "./units";

export type ImportSource = "strong" | "hevy";
export const SOURCE_LABEL: Record<ImportSource, string> = { strong: "Strong", hevy: "Hevy" };

type RawSet = { warmup: boolean; weight: number | null; reps: number | null; seconds: number | null; distance?: number | null };
export type RawEntry = { name: string; notes: string | null; supersetId: string | null; sets: RawSet[] };
export type RawWorkout = { key: string; name: string; startedAt: Date; notes: string | null; entries: RawEntry[] };
export type ParsedFile = { source: ImportSource; workouts: RawWorkout[]; unitInFile: boolean };

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 rows: quoted fields, doubled quotes, CRLF, a BOM, and "," or ";" between fields. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const num = (s: string | undefined): number | null => {
  const t = s?.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const text = (s: string | undefined) => s?.trim() || null;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2024-03-05 18:30:00" (Strong) or "5 Mar 2024, 18:30" (Hevy), in local time. */
export function parseLocalDate(s: string): Date | null {
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0));
  const hevy = s.trim().match(/^(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4}),? (\d{1,2}):(\d{2})/);
  const month = hevy ? MONTHS.indexOf(hevy[2].toLowerCase()) : -1;
  if (hevy && month >= 0) return new Date(+hevy[3], month, +hevy[1], +hevy[4], +hevy[5]);
  return null;
}

// ---------------------------------------------------------------------------
// Strong and Hevy exports → workouts
// ---------------------------------------------------------------------------

export class ImportFileError extends Error {}

/** Reads a Strong or Hevy CSV export. Weights in the file's unit, or `unit` when it doesn't say. */
export function parseExport(csv: string, unit: WeightUnit): ParsedFile {
  const [header, ...rows] = parseCsv(csv);
  if (!header) throw new ImportFileError("That file is empty.");
  const cols = header.map((h) => h.trim().toLowerCase());
  const at = (pred: (h: string) => boolean) => cols.findIndex(pred);

  let source: ImportSource;
  let c: { date: number; name: number; exercise: number; order: number; weight: number; reps: number; seconds: number; distance: number; notes: number; workoutNotes: number; superset: number; unitCol: number };
  let fileUnit: WeightUnit | null = null;

  if (cols.includes("exercise_title") && cols.includes("start_time")) {
    source = "hevy";
    const weight = at((h) => h === "weight_kg" || h === "weight_lbs");
    if (weight >= 0) fileUnit = cols[weight] === "weight_lbs" ? "lb" : "kg";
    c = {
      date: at((h) => h === "start_time"), name: at((h) => h === "title"), exercise: at((h) => h === "exercise_title"),
      order: at((h) => h === "set_type"), weight, reps: at((h) => h === "reps"), seconds: at((h) => h === "duration_seconds"), distance: at((h) => h.startsWith("distance")),
      notes: at((h) => h === "exercise_notes"), workoutNotes: at((h) => h === "description"), superset: at((h) => h === "superset_id"), unitCol: -1,
    };
  } else if (cols.includes("exercise name") && cols.includes("set order")) {
    source = "strong";
    const weight = at((h) => h.startsWith("weight") && h !== "weight unit");
    if (weight >= 0 && /\(kgs?\)/.test(cols[weight])) fileUnit = "kg";
    if (weight >= 0 && /\(lbs?\)/.test(cols[weight])) fileUnit = "lb";
    c = {
      date: at((h) => h === "date"), name: at((h) => h === "workout name"), exercise: at((h) => h === "exercise name"),
      order: at((h) => h === "set order"), weight, reps: at((h) => h === "reps"), seconds: at((h) => h === "seconds"), distance: at((h) => h.startsWith("distance")),
      notes: at((h) => h === "notes"), workoutNotes: at((h) => h === "workout notes"), superset: -1, unitCol: at((h) => h === "weight unit"),
    };
  } else {
    throw new ImportFileError("This doesn’t look like a Strong or Hevy export. Export your workouts as CSV from the app’s settings and choose that file.");
  }
  if (c.date < 0 || c.exercise < 0 || c.reps < 0) throw new ImportFileError("Some columns are missing from this file. Export it again from the app and try once more.");

  const workouts = new Map<string, RawWorkout>();
  for (const r of rows) {
    const rawDate = r[c.date]?.trim() ?? "";
    const startedAt = parseLocalDate(rawDate);
    const exercise = text(r[c.exercise]);
    if (!startedAt || !exercise) continue;

    // Strong: 1, 2, 3… working, W warm-up, D drop, F failure; anything else (rest timers, notes) isn't a set.
    // Hevy: normal, warmup, failure, dropset.
    const order = (r[c.order] ?? "").trim().toLowerCase();
    if (source === "strong" && !/^(\d+|w|d|f)$/.test(order)) continue;
    const warmup = order === "w" || order === "warmup";

    const name = text(r[c.name]) ?? "Workout";
    const key = `${rawDate}|${name}`.slice(0, 180);
    let w = workouts.get(key);
    if (!w) {
      w = { key, name, startedAt, notes: c.workoutNotes >= 0 ? text(r[c.workoutNotes]) : null, entries: [] };
      workouts.set(key, w);
    }
    const supersetId = c.superset >= 0 ? text(r[c.superset]) : null;
    let entry = w.entries[w.entries.length - 1];
    if (!entry || entry.name !== exercise) {
      entry = { name: exercise, notes: null, supersetId, sets: [] };
      w.entries.push(entry);
    }
    const note = c.notes >= 0 ? text(r[c.notes]) : null;
    if (note && !entry.notes) entry.notes = note;

    const rowUnit: WeightUnit = c.unitCol >= 0 && /lb/i.test(r[c.unitCol] ?? "") ? "lb" : c.unitCol >= 0 && /kg/i.test(r[c.unitCol] ?? "") ? "kg" : fileUnit ?? unit;
    const weight = num(r[c.weight]);
    entry.sets.push({
      warmup,
      weight: weight === null ? null : rowUnit === "lb" ? weight * KG_PER_LB : weight,
      reps: num(r[c.reps]),
      seconds: c.seconds >= 0 ? num(r[c.seconds]) : null,
      distance: c.distance >= 0 ? num(r[c.distance]) : null,
    });
  }
  return { source, workouts: [...workouts.values()].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()), unitInFile: fileUnit !== null || c.unitCol >= 0 };
}

// ---------------------------------------------------------------------------
// Matching exercises
// ---------------------------------------------------------------------------

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const FILLER = new Set(["bicep", "biceps", "tricep", "triceps", "the"]);
/** The words regardless of order and plurals: "Seated Row (Cable)" and "Seated Cable Rows" agree. */
const wordKey = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .sort()
    .join(" ");

const EQUIPMENT: { equipment: string; labels: RegExp; words: string[] }[] = [
  { equipment: "barbell", labels: /^(barbell|olympic bar)$/, words: ["barbell"] },
  { equipment: "dumbbell", labels: /^(dumbbells?|db)$/, words: ["dumbbell", "db"] },
  { equipment: "machine", labels: /^(machine|plate loaded|lever|machine other)$/, words: ["machine"] },
  { equipment: "cable", labels: /^cables?$/, words: ["cable"] },
  { equipment: "smith_machine", labels: /^smith( machine)?$/, words: ["smith machine", "smith"] },
  { equipment: "kettlebell", labels: /^kettlebells?$/, words: ["kettlebell"] },
  { equipment: "ez_bar", labels: /^ez[ -]?(curl )?bar$/, words: ["ez bar"] },
  { equipment: "trap_bar", labels: /^(trap|hex) bar$/, words: ["trap bar", "hex bar"] },
  { equipment: "band", labels: /^(resistance )?bands?$/, words: ["band"] },
  { equipment: "bodyweight", labels: /^(bodyweight|body weight)$/, words: [] },
];

/** "Bench Press (Barbell)" → base "Bench Press", equipment barbell; "(Weighted)" → "Weighted Pull Up". */
export function splitImportedName(name: string): { base: string; equipment: string | null; prefix: string | null } {
  const m = name.trim().match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { base: name.trim(), equipment: null, prefix: null };
  // "Cable - Straight Bar": the equipment comes first.
  const label = m[2].split(" - ")[0].trim().toLowerCase();
  const known = EQUIPMENT.find((e) => e.labels.test(label));
  if (known) return { base: m[1], equipment: known.equipment, prefix: null };
  if (label === "weighted" || label === "assisted") return { base: m[1], equipment: null, prefix: label };
  return { base: name.trim(), equipment: null, prefix: null };
}

/** The exercise an imported name means, or null when it isn't clearly one. */
export function matchExercise(name: string, list: Exercise[]): Exercise | null {
  const usable = list.filter((e) => !e.archived_at);
  const full = squash(name);
  const own = usable.filter((e) => e.owner_id !== null && squash(e.variant ? `${e.name} ${e.variant}` : e.name) === full);
  if (own.length === 1) return own[0];

  const { base, equipment, prefix } = splitImportedName(name);
  const b = prefix ? `${prefix} ${base}` : base;
  const words = EQUIPMENT.find((e) => e.equipment === equipment)?.words ?? [];
  const forms = [name, b, ...words.map((w) => `${w} ${b}`)];
  const wanted = new Set([...forms.map(squash), ...forms.map(wordKey)]);
  const hits = usable.filter((e) => [e.name, ...e.aliases].some((k) => wanted.has(squash(k)) || wanted.has(wordKey(k))));
  const fits = equipment ? hits.filter((e) => e.equipment === equipment || (equipment === "bodyweight" && e.tracking_mode !== "weight_reps")) : hits;
  const catalogue = fits.filter((e) => e.owner_id === null);
  if (catalogue.length === 1) return catalogue[0];
  return fits.length === 1 ? fits[0] : null;
}

const MUSCLES: [RegExp, string][] = [
  [/leg curl|hamstring|romanian|\brdl\b|stiff.?leg|good morning|nordic/, "hamstrings"],
  [/calf|calves/, "calves"],
  [/squat|leg press|lunge|leg extension|step.?up|hack|sissy/, "quads"],
  [/hip thrust|glute|bridge|abduct/, "glutes"],
  [/adduct/, "adductors"],
  [/tricep|push.?down|skull|close.?grip|\bdips?\b|overhead extension|kickback/, "triceps"],
  [/shoulder|overhead press|\bohp\b|military|lateral raise|front raise|rear delt|face pull|arnold|upright row|reverse fly/, "shoulders"],
  [/bench|chest|\bfly|flye|\bpec|push.?up|press.?up/, "chest"],
  [/row|pull.?up|chin.?up|pull.?down|\blats?\b|shrug|back extension|deadlift|pullover/, "back"],
  [/curl/, "biceps"],
  [/wrist|forearm|farmer|grip/, "forearms"],
  [/crunch|plank|\babs?\b|sit.?up|leg raise|knee raise|russian twist|wood.?chop|pallof|hollow|v.?up|ab wheel|rollout/, "core"],
];

export function guessMuscle(name: string): string {
  const n = name.toLowerCase();
  return MUSCLES.find(([re]) => re.test(n))?.[1] ?? "full_body";
}

function guessEquipment(name: string, mode: TrackingMode): string {
  const parsed = splitImportedName(name).equipment;
  if (parsed) return parsed;
  const n = ` ${name.toLowerCase()} `;
  const found = EQUIPMENT.find((e) => e.words.some((w) => n.includes(` ${w} `)));
  if (found) return found.equipment;
  return mode === "weight_reps" ? "other" : "bodyweight";
}

/** How a new custom exercise should be tracked, from its sets; null for cardio (distance only). */
export function guessMode(sets: RawSet[]): TrackingMode | null {
  const withReps = sets.filter((s) => (s.reps ?? 0) >= 1);
  const loaded = sets.some((s) => (s.weight ?? 0) > 0);
  if (withReps.length) return loaded ? "weight_reps" : "bodyweight_reps";
  if (sets.some((s) => (s.distance ?? 0) > 0)) return null;
  if (sets.some((s) => (s.seconds ?? 0) >= 1)) return loaded ? "added_weight_duration" : "duration";
  return null;
}

// ---------------------------------------------------------------------------
// Plan: what will be imported
// ---------------------------------------------------------------------------

export type PlanExercise = {
  name: string;
  /** Existing exercise it matched, or null when a custom exercise will be created. */
  match: Exercise | null;
  mode: TrackingMode | null;
  key: string;
  sets: number;
};

export type NewExercise = { key: string; name: string; primary_muscle: string; equipment: string; tracking_mode: TrackingMode };
export type PayloadSet = { set_type: "working" | "warmup"; weight_kg: number | null; reps: number };
export type PayloadEntry = { exercise_id?: string; exercise_key?: string; notes: string | null; superset_next: boolean; sets: PayloadSet[] };
export type PayloadSession = { key: string; name: string; started_at: string; notes: string | null; exercises: PayloadEntry[] };

export type ImportPlan = {
  source: ImportSource;
  exercises: PlanExercise[];
  newExercises: NewExercise[];
  sessions: PayloadSession[];
  sets: number;
  /** Distance-only (cardio) exercises, which Setmodo doesn't track. */
  skippedCardio: string[];
  first: Date | null;
  last: Date | null;
};

const timed = (m: TrackingMode) => m === "duration" || m === "added_weight_duration";
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** A set as Setmodo stores it for that tracking mode, or null if it can't be (empty, or out of range). */
export function toPayloadSet(s: RawSet, mode: TrackingMode): PayloadSet | null {
  const amount = timed(mode) ? s.seconds : s.reps;
  if (amount === null || amount < 1) return null;
  const reps = Math.round(amount);
  if (reps > (timed(mode) ? 3600 : 1000)) return null;
  const set_type = s.warmup ? "warmup" : "working";
  if (mode === "bodyweight_reps" || mode === "duration") return { set_type, weight_kg: null, reps };
  const weight = s.weight ?? 0;
  if (weight < 0 || weight > MAX_WEIGHT_KG) return null;
  return { set_type, weight_kg: round(weight, 4), reps };
}

export function planImport(file: ParsedFile, exercises: Exercise[], now = new Date()): ImportPlan {
  const byName = new Map<string, PlanExercise>();
  const setsByName = new Map<string, RawSet[]>();
  for (const w of file.workouts)
    for (const e of w.entries) {
      const list = setsByName.get(e.name);
      if (list) list.push(...e.sets);
      else setsByName.set(e.name, [...e.sets]);
    }

  setsByName.forEach((sets, name) => {
    const match = matchExercise(name, exercises);
    byName.set(name, { name, match, mode: match ? match.tracking_mode : guessMode(sets), key: `x${byName.size}`, sets: 0 });
  });

  const sessions: PayloadSession[] = [];
  let total = 0;
  for (const w of file.workouts) {
    if (w.startedAt.getTime() > now.getTime()) continue;
    const entries: (PayloadEntry & { supersetId: string | null })[] = [];
    for (const e of w.entries) {
      const plan = byName.get(e.name)!;
      if (!plan.mode) continue;
      const sets = e.sets.map((s) => toPayloadSet(s, plan.mode!)).filter((s): s is PayloadSet => s !== null);
      if (!sets.length) continue;
      plan.sets += sets.length;
      total += sets.length;
      entries.push({
        ...(plan.match ? { exercise_id: plan.match.id } : { exercise_key: plan.key }),
        notes: e.notes?.slice(0, 1000) ?? null,
        superset_next: false,
        supersetId: e.supersetId,
        sets: sets.slice(0, 100),
      });
    }
    if (!entries.length) continue;
    entries.forEach((e, i) => (e.superset_next = e.supersetId !== null && entries[i + 1]?.supersetId === e.supersetId));
    sessions.push({
      key: w.key,
      name: w.name.slice(0, 60),
      started_at: w.startedAt.toISOString(),
      notes: w.notes?.slice(0, 2000) ?? null,
      exercises: entries.slice(0, 60).map((e) => ({ exercise_id: e.exercise_id, exercise_key: e.exercise_key, notes: e.notes, superset_next: e.superset_next, sets: e.sets })),
    });
  }

  const planned = [...byName.values()];
  const used = planned.filter((p) => p.sets > 0);
  return {
    source: file.source,
    exercises: used.sort((a, b) => b.sets - a.sets),
    newExercises: used
      .filter((p) => !p.match)
      .map((p) => ({ key: p.key, name: p.name.slice(0, 80), primary_muscle: guessMuscle(p.name), equipment: guessEquipment(p.name, p.mode!), tracking_mode: p.mode! })),
    sessions,
    sets: total,
    skippedCardio: planned.filter((p) => !p.mode).map((p) => p.name),
    first: sessions.length ? new Date(sessions[0].started_at) : null,
    last: sessions.length ? new Date(sessions[sessions.length - 1].started_at) : null,
  };
}

/** Splits a plan into calls of at most `size` workouts; new exercises go with the first call. */
export function importBatches(plan: ImportPlan, size = 50): { exercises: NewExercise[]; sessions: PayloadSession[] }[] {
  const batches: { exercises: NewExercise[]; sessions: PayloadSession[] }[] = [];
  for (let i = 0; i < plan.newExercises.length; i += 300) batches.push({ exercises: plan.newExercises.slice(i, i + 300), sessions: [] });
  for (let i = 0; i < plan.sessions.length; i += size) batches.push({ exercises: [], sessions: plan.sessions.slice(i, i + size) });
  return batches;
}

/** After the new exercises exist: point the workouts at their ids. */
export function resolveExerciseKeys(sessions: PayloadSession[], ids: Record<string, string>): PayloadSession[] {
  return sessions.map((s) => ({
    ...s,
    exercises: s.exercises.map(({ exercise_key, ...e }) => (exercise_key ? { ...e, exercise_id: ids[exercise_key] } : e)),
  }));
}
