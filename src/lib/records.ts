import { formatKg } from "./format";
import { E1RM_REP_LIMIT, estimate1RM } from "./progress";
import type { PreviousSet, TrackingMode } from "./types";

/**
 * Personal records and like-for-like comparisons. Everything is derived from the user's
 * completed history at the time it is shown, so editing or deleting an old workout updates
 * records automatically; nothing is stored.
 *
 * Definitions (working sets only; warm-ups never count):
 * - First recorded performance: no earlier session contains a completed working set of this
 *   exercise. Other records are not announced alongside it.
 * - Heaviest load: a weight heavier than every earlier working set (added weight for
 *   weighted bodyweight exercises). Reps-only exercises have no load record.
 * - Rep record at a load: more reps at a weight than any earlier working set at exactly that
 *   weight. Only weights done before qualify, otherwise it is simply a new weight. For
 *   reps-only exercises: more reps in one set than ever before.
 * - Estimated 1RM record (weight × reps only): the highest Epley estimate from sets of
 *   1–12 reps beats every earlier eligible set. High-rep sets are excluded because the
 *   formula overestimates them. Always labelled as an estimate.
 * - Ties are never records: the new value must be strictly greater.
 */

export const E1RM_MAX_REPS = E1RM_REP_LIMIT;

export type DatedSets = { sessionId: string; performedAt: string; sets: PreviousSet[] };

export type RecordKind = "first" | "heaviest" | "reps_at_load" | "most_reps" | "e1rm";
export type PersonalRecord = { kind: RecordKind; label: string; detail: string };

const r1 = (n: number) => Math.round(n * 10) / 10;
const working = (sets: PreviousSet[]) => sets.filter((s) => s.set_type === "working" && s.reps > 0);
const load = (mode: TrackingMode, kg: number | null) => `${mode === "added_weight_reps" ? "+" : ""}${formatKg(kg ?? 0)} kg`;

export const isE1RMEligible = (s: PreviousSet) => s.set_type === "working" && s.reps >= 1 && s.reps <= E1RM_MAX_REPS && (s.weight_kg ?? 0) > 0;

/** Records set in `current`, compared with sessions performed before it. */
export function recordsFor(mode: TrackingMode, current: DatedSets, history: DatedSets[]): PersonalRecord[] {
  const now = working(current.sets);
  if (!now.length) return [];
  const earlier = history
    .filter((h) => h.sessionId !== current.sessionId && h.performedAt < current.performedAt)
    .flatMap((h) => working(h.sets));
  if (!earlier.length) return [{ kind: "first", label: "First recorded performance", detail: "Your baseline for this exercise is set." }];

  const out: PersonalRecord[] = [];
  if (mode === "bodyweight_reps") {
    const best = Math.max(...now.map((s) => s.reps));
    const before = Math.max(...earlier.map((s) => s.reps));
    if (best > before) out.push({ kind: "most_reps", label: "Most reps in a set", detail: `${best} reps (previous best ${before})` });
    return out;
  }

  const top = Math.max(...now.map((s) => s.weight_kg ?? 0));
  const prevTop = Math.max(...earlier.map((s) => s.weight_kg ?? 0));
  if (top > prevTop && top > 0) {
    out.push({ kind: "heaviest", label: "Heaviest load", detail: `${load(mode, top)} (previous ${load(mode, prevTop)})` });
  }

  // Rep record at a load done before; report the heaviest such load only.
  const repRecords = [...new Set(now.map((s) => s.weight_kg ?? 0))]
    .map((w) => {
      const before = earlier.filter((s) => (s.weight_kg ?? 0) === w);
      if (!before.length) return null;
      const reps = Math.max(...now.filter((s) => (s.weight_kg ?? 0) === w).map((s) => s.reps));
      const prev = Math.max(...before.map((s) => s.reps));
      return reps > prev ? { w, reps, prev } : null;
    })
    .filter((x): x is { w: number; reps: number; prev: number } => x !== null)
    .sort((a, b) => b.w - a.w);
  if (repRecords.length) {
    const { w, reps, prev } = repRecords[0];
    out.push({ kind: "reps_at_load", label: `Rep record at ${load(mode, w)}`, detail: `${reps} reps (previous best ${prev})` });
  }

  if (mode === "weight_reps") {
    const eligibleNow = now.filter(isE1RMEligible);
    const eligibleBefore = earlier.filter(isE1RMEligible);
    if (eligibleNow.length && eligibleBefore.length) {
      const best = Math.max(...eligibleNow.map((s) => r1(estimate1RM(s.weight_kg ?? 0, s.reps))));
      const before = Math.max(...eligibleBefore.map((s) => r1(estimate1RM(s.weight_kg ?? 0, s.reps))));
      if (best > before) {
        out.push({ kind: "e1rm", label: "Estimated 1RM record", detail: `${formatKg(best)} kg estimated (previous ${formatKg(before)} kg)` });
      }
    }
  }
  return out;
}

/**
 * Factual change against the previous performance, matching working sets by order. Only
 * the sets both sessions have are compared, so doing extra sets is never called "better".
 * Returns null when there is nothing honest to say (no previous, or loads differ per set).
 */
export function compareWithPrevious(mode: TrackingMode, current: PreviousSet[], previous: PreviousSet[] | undefined): string | null {
  const now = working(current);
  const before = working(previous ?? []);
  if (!now.length || !before.length) return null;
  const n = Math.min(now.length, before.length);
  const a = before.slice(0, n);
  const b = now.slice(0, n);

  if (mode === "bodyweight_reps") {
    const diff = b.reduce((t, s) => t + s.reps, 0) - a.reduce((t, s) => t + s.reps, 0);
    return repDiffText(diff, null, mode);
  }
  const wA = new Set(a.map((s) => s.weight_kg ?? 0));
  const wB = new Set(b.map((s) => s.weight_kg ?? 0));
  if (wA.size === 1 && wB.size === 1) {
    const [x] = [...wA];
    const [y] = [...wB];
    if (x === y) return repDiffText(b.reduce((t, s) => t + s.reps, 0) - a.reduce((t, s) => t + s.reps, 0), x, mode);
    return `${y > x ? "Up" : "Down"} from ${load(mode, x)} to ${load(mode, y)}`;
  }
  const topA = Math.max(...a.map((s) => s.weight_kg ?? 0));
  const topB = Math.max(...b.map((s) => s.weight_kg ?? 0));
  if (topA !== topB) return `Top set ${topB > topA ? "up" : "down"} from ${load(mode, topA)} to ${load(mode, topB)}`;
  return null;
}

function repDiffText(diff: number, weight: number | null, mode: TrackingMode): string {
  const at = weight === null ? "" : ` at ${load(mode, weight)}`;
  if (diff === 0) return `Same reps${at} as last time`;
  const n = Math.abs(diff);
  return `${n} ${diff > 0 ? "more" : "fewer"} ${n === 1 ? "rep" : "reps"}${at}`;
}
