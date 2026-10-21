/**
 * Supersets: exercises done back to back as one round. An exercise with superset_next is
 * linked to the one after it; a run of linked exercises is one superset (A1, A2, A3), and the
 * flag on the last one in a workout means nothing. Pure; unit-tested.
 */
import type { SessionDoc } from "./types";

type Linked = { superset_next?: boolean | null };

/** The supersets in a list, as index ranges [first, last], in order. Single exercises aren't included. */
export function supersetRanges(items: readonly Linked[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  items.forEach((it, i) => {
    const linked = Boolean(it.superset_next) && i < items.length - 1;
    if (linked && start < 0) start = i;
    if (!linked && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  });
  return out;
}

/** "A1", "A2", "B1"… for exercises in a superset, null for the rest. */
export function supersetLabels(items: readonly Linked[]): (string | null)[] {
  const labels: (string | null)[] = items.map(() => null);
  supersetRanges(items).forEach(([a, b], g) => {
    for (let i = a; i <= b; i++) labels[i] = `${String.fromCharCode(65 + (g % 26))}${i - a + 1}`;
  });
  return labels;
}

/** The superset an exercise belongs to, as indexes into doc.exercises (or null). */
function rangeOf(doc: SessionDoc, entryId: string): [number, number] | null {
  const i = doc.exercises.findIndex((e) => e.id === entryId);
  return supersetRanges(doc.exercises).find(([a, b]) => i >= a && i <= b) ?? null;
}

/**
 * After ticking a set of an exercise in a superset: the next set to do in the round, which is
 * the next exercise's first unconfirmed working set, wrapping back to the first exercise for
 * the next round. Skipped exercises and exercises with nothing left are passed over. Null when
 * the exercise isn't in a superset or the superset is finished.
 */
export function nextInSuperset(doc: SessionDoc, entryId: string): { entryId: string; setId: string } | null {
  const range = rangeOf(doc, entryId);
  if (!range) return null;
  const [a, b] = range;
  const i = doc.exercises.findIndex((e) => e.id === entryId);
  const size = b - a + 1;
  for (let step = 1; step <= size; step++) {
    const ex = doc.exercises[a + ((i - a + step) % size)];
    if (ex.skipped) continue;
    const set = ex.sets.find((s) => !s.completed_at && s.set_type === "working") ?? ex.sets.find((s) => !s.completed_at);
    if (set) return { entryId: ex.id, setId: set.id };
  }
  return null;
}

/**
 * Whether ticking a set of this exercise ends a round, so the rest timer should start: always
 * for exercises not in a superset; in a superset, only when the next set to do is back at an
 * earlier exercise (a new round) or nothing is left.
 */
export function endsRound(doc: SessionDoc, entryId: string): boolean {
  const range = rangeOf(doc, entryId);
  if (!range) return true;
  const next = nextInSuperset(doc, entryId);
  if (!next) return true;
  const i = doc.exercises.findIndex((e) => e.id === entryId);
  const j = doc.exercises.findIndex((e) => e.id === next.entryId);
  return j <= i;
}
