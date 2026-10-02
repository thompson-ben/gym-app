/**
 * Which workout of the active split comes next. This is a sequence suggestion only: it says
 * where the user is in their own split order, never whether they are "ready" to train.
 *
 * Rules (kept deliberately simple and predictable):
 * - Only the active split's current workouts are candidates, in their saved order. Workouts
 *   without exercises cannot be started and are passed over.
 * - Only completed sessions of those workouts during the current active period count. Quick
 *   workouts, other splits and workouts since removed from the split are ignored.
 * - Sessions are ordered by when they were performed, so a past workout logged today is
 *   placed on its own date and does not move the sequence forward.
 * - Next = the workout after the most recently performed one, wrapping round. Doing workouts
 *   out of order or skipping one simply continues from the latest.
 * - Nothing performed yet in this period: the first workout, unless this split has been
 *   trained in an earlier period. Then we are not confident where the user wants to resume
 *   and say "Choose a workout" instead of guessing.
 */

export type SplitWorkout = { id: string; name: string; position: number; exerciseCount: number };
export type PerformedSession = { templateId: string | null; performedAt: string };

export type NextWorkout =
  | { kind: "next"; templateId: string; reason: string; after: string }
  | { kind: "first"; templateId: string; reason: string }
  | { kind: "only"; templateId: string; reason: string }
  | { kind: "choose"; reason: string };

export function suggestNextWorkout(input: {
  workouts: SplitWorkout[];
  /** Completed sessions of this split performed during the current active period. */
  periodSessions: PerformedSession[];
  /** Whether any of this split's workouts were completed before the current period. */
  trainedInEarlierPeriod: boolean;
}): NextWorkout {
  const ordered = [...input.workouts].sort((a, b) => a.position - b.position);
  const startable = ordered.filter((w) => w.exerciseCount > 0);
  if (!startable.length) return { kind: "choose", reason: "Add exercises to a workout to start it." };
  if (startable.length === 1) return { kind: "only", templateId: startable[0].id, reason: "The only workout in this split" };

  const ids = new Set(ordered.map((w) => w.id));
  const latest = input.periodSessions
    .filter((s) => s.templateId !== null && ids.has(s.templateId))
    .reduce<PerformedSession | null>((a, b) => (!a || b.performedAt > a.performedAt ? b : a), null);

  if (!latest) {
    if (input.trainedInEarlierPeriod) return { kind: "choose", reason: "Pick up wherever you like." };
    return { kind: "first", templateId: startable[0].id, reason: "First in your split order" };
  }

  const index = ordered.findIndex((w) => w.id === latest.templateId);
  const last = ordered[index];
  for (let step = 1; step <= ordered.length; step++) {
    const candidate = ordered[(index + step) % ordered.length];
    if (candidate.exerciseCount > 0 && candidate.id !== last.id) {
      return { kind: "next", templateId: candidate.id, after: last.name, reason: `Next after ${last.name} in your split order` };
    }
  }
  return { kind: "choose", reason: "Pick up wherever you like." };
}
