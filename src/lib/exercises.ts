import type { Exercise } from "./types";

export const EXERCISE_COLUMNS =
  "id, owner_id, slug, name, variant, primary_muscle, equipment, tracking_mode, aliases, origin_exercise_id, archived_at";

export function exerciseLabel(e: Pick<Exercise, "name" | "variant">): string {
  return e.variant ? `${e.name} · ${e.variant}` : e.name;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Search by name, variant, aliases, muscle and equipment. Every query word must match. */
export function searchExercises(list: Exercise[], query: string, muscle: string | null): Exercise[] {
  const words = normalise(query).split(" ").filter(Boolean);
  return list.filter((e) => {
    if (muscle && e.primary_muscle !== muscle) return false;
    if (!words.length) return true;
    const haystack = normalise([e.name, e.variant ?? "", ...e.aliases, e.primary_muscle, e.equipment].join(" "));
    return words.every((w) => haystack.includes(w));
  });
}

/**
 * Exercises whose names look similar. Used only to *suggest* existing exercises (for example
 * before creating a duplicate custom exercise); never to merge anything automatically.
 */
export function similarExercises(list: Exercise[], name: string): Exercise[] {
  const target = normalise(name);
  if (target.length < 3) return [];
  const words = target.split(" ").filter((w) => w.length > 2);
  return list
    .filter((e) => {
      const n = normalise(e.name);
      return n === target || n.includes(target) || target.includes(n) || (words.length > 0 && words.every((w) => n.includes(w)));
    })
    .slice(0, 5);
}
