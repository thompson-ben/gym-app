/**
 * What goes on a shareable workout image: the workout, its best set per exercise and any
 * records. Pure; unit-tested. The image itself is drawn in the browser (ShareWorkoutButton).
 */
import { formatSet } from "./format";
import type { PersonalRecord } from "./records";
import { isTimed, isUnloaded, type SessionDoc, type TrackingMode } from "./types";
import { formatWeightValue, type WeightUnit } from "./units";

export type ShareCard = {
  title: string;
  eyebrow: string;
  stats: string;
  /** previous: the best set from the last time this exercise was done, when there was one. */
  lines: { name: string; best: string; previous: string | null }[];
  records: string[];
  more: number;
};

const MAX_LINES = 6;
const MAX_RECORDS = 3;

/** "80 kg × 8", "+10 kg × 6", "12 reps", "45 s". */
export function bestSetLabel(mode: TrackingMode, weight: number | null, reps: number, unit: WeightUnit): string {
  if (mode === "weight_reps") return `${formatWeightValue(weight, unit)} ${unit} × ${reps}`;
  if ((mode === "added_weight_reps" || mode === "added_weight_duration") && weight) {
    return `+${formatWeightValue(weight, unit)} ${unit} × ${isTimed(mode) ? `${reps} s` : reps}`;
  }
  return formatSet(mode, weight, reps, unit);
}

type SetLike = { set_type: string; weight_kg: number | null; reps: number | null };

/** Heaviest load first, then most reps (or seconds); bodyweight and holds by reps alone. */
export function bestSet<T extends SetLike>(mode: TrackingMode, sets: T[]): T | null {
  const working = sets.filter((s) => s.set_type === "working" && (s.reps ?? 0) > 0);
  return (
    [...working].sort((a, b) =>
      isUnloaded(mode) ? (b.reps ?? 0) - (a.reps ?? 0) : (b.weight_kg ?? 0) - (a.weight_kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
    )[0] ?? null
  );
}

export function shareCard(
  doc: SessionDoc,
  records: (PersonalRecord & { exercise: string })[],
  opts: { unit: WeightUnit; date: string; durationMinutes: number | null; previous?: Record<string, SetLike[] | undefined> },
): ShareCard {
  const performed = doc.exercises
    .map((e) => ({ e, sets: e.sets.filter((s) => s.set_type === "working" && (s.reps ?? 0) > 0) }))
    .filter((x) => x.sets.length);
  const lines = performed.map(({ e, sets }) => {
    const best = bestSet(e.tracking_mode, sets)!;
    const before = bestSet(e.tracking_mode, opts.previous?.[e.exercise_id] ?? []);
    return {
      name: e.exercise_name,
      best: bestSetLabel(e.tracking_mode, best.weight_kg, best.reps ?? 0, opts.unit),
      previous: before ? bestSetLabel(e.tracking_mode, before.weight_kg, before.reps ?? 0, opts.unit) : null,
    };
  });
  const sets = performed.reduce((n, x) => n + x.sets.length, 0);
  const stats = [
    `${performed.length} ${performed.length === 1 ? "exercise" : "exercises"}`,
    `${sets} ${sets === 1 ? "set" : "sets"}`,
    opts.durationMinutes ? `${opts.durationMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const prs = records
    .filter((r) => r.kind !== "first")
    .map((r) => {
      // "Estimated 1RM record" + "88.7 kg estimated (previous …)" → "estimated 1RM 88.7 kg".
      const label = r.label.replace(/ record$/i, "");
      const detail = r.detail.replace(/\s*\(.*\)\s*$/, "").replace(/ estimated$/, "");
      return `${r.exercise}: ${label.charAt(0).toLowerCase()}${label.slice(1)} ${detail}`;
    });
  return {
    title: doc.template_name,
    eyebrow: [doc.split_name, opts.date].filter(Boolean).join(" · "),
    stats,
    lines: lines.slice(0, MAX_LINES),
    records: prs.slice(0, MAX_RECORDS),
    more: Math.max(0, lines.length - MAX_LINES),
  };
}
