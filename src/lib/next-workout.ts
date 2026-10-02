/**
 * Which workout of the active split to suggest next. A rotation hint only: it never judges
 * whether the user is "ready" to train.
 *
 * Rule: the active split's workout that was performed longest ago.
 * - Only the active split's current workouts are candidates. Workouts without exercises
 *   cannot be started and are passed over.
 * - "Performed" means a completed session of that workout, dated when it was performed, so a
 *   past workout logged today counts on its own date. Quick workouts, other splits' workouts
 *   and workouts no longer in the split never count.
 * - A workout never performed comes first (in split order when there are several).
 * - Otherwise the one with the oldest last-performed date; ties go to the earlier one in the
 *   split's order.
 */

export type SplitWorkout = {
  id: string;
  name: string;
  position: number;
  exerciseCount: number;
  /** Date this workout was last performed (any time), or null if never. */
  lastPerformed: string | null;
};

export type NextWorkout =
  | { kind: "next"; templateId: string; reason: string }
  | { kind: "only"; templateId: string; reason: string }
  | { kind: "choose"; reason: string };

export function suggestNextWorkout(workouts: SplitWorkout[], formatDate: (iso: string) => string = (iso) => iso.slice(0, 10)): NextWorkout {
  const startable = [...workouts].filter((w) => w.exerciseCount > 0).sort((a, b) => a.position - b.position);
  if (!startable.length) return { kind: "choose", reason: "Add exercises to a workout to start it." };
  if (startable.length === 1) return { kind: "only", templateId: startable[0].id, reason: "The only workout in this split" };

  const never = startable.find((w) => w.lastPerformed === null);
  if (never) {
    const anyDone = startable.some((w) => w.lastPerformed !== null);
    return { kind: "next", templateId: never.id, reason: anyDone ? "Not done yet in this split" : "First in your split order" };
  }
  const oldest = startable.reduce((a, b) => (b.lastPerformed! < a.lastPerformed! ? b : a));
  return { kind: "next", templateId: oldest.id, reason: `Done longest ago in this split (last ${formatDate(oldest.lastPerformed!)})` };
}
