import type { PreviousSet, SetType, TrackingMode } from "../types";

type TypedRow = { set_type: SetType };

/**
 * Pairs each current row with the corresponding set from the last session: the n-th working
 * set with the previous n-th working set, the n-th warm-up with the previous n-th warm-up.
 * Rows without a counterpart get null (shown as an empty Previous cell), never a value
 * borrowed from another day or another set.
 */
export function matchPrevious(rows: TypedRow[], previous: PreviousSet[] | undefined): (PreviousSet | null)[] {
  const byType: Record<SetType, PreviousSet[]> = { working: [], warmup: [] };
  for (const set of previous ?? []) byType[set.set_type].push(set);
  const seen: Record<SetType, number> = { working: 0, warmup: 0 };
  return rows.map((row) => byType[row.set_type][seen[row.set_type]++] ?? null);
}

/**
 * Weight to prefill for a new row. Uses the matched previous set; if there is none (e.g. more
 * sets than last time) falls back to the last previous set of the same type. This is only
 * an editable suggestion and is never recorded unless the set is confirmed.
 */
export function suggestWeight(
  mode: TrackingMode,
  matched: PreviousSet | null,
  previous: PreviousSet[] | undefined,
  setType: SetType,
): number | null {
  if (mode === "bodyweight_reps") return null;
  if (matched) return matched.weight_kg;
  const sameType = (previous ?? []).filter((s) => s.set_type === setType);
  return sameType.length ? sameType[sameType.length - 1].weight_kg : null;
}
