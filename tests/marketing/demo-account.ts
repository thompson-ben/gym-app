import { STARTERS } from "../../src/lib/starters";
import { catalogueId, db, type TestUser } from "../e2e/helpers";

/** Builds a demo account (sample data only) with twelve weeks of Push / Pull / Legs training using double progression. */

const DAY = 86_400_000;
const PPL = STARTERS.find((s) => s.key === "push-pull-legs")!;

/** Starting weight and increment (kg) per exercise, for the simulated history. */
const START: Record<string, [number, number]> = {
  "barbell-bench-press": [60, 2.5],
  "seated-dumbbell-shoulder-press": [18, 2],
  "incline-dumbbell-press": [22, 2],
  "cable-lateral-raise": [7.5, 1.25],
  "triceps-pushdown": [25, 2.5],
  "lat-pulldown": [55, 2.5],
  "barbell-row": [50, 2.5],
  "face-pull": [20, 2.5],
  "ez-bar-curl": [25, 2.5],
  "hammer-curl": [12, 2],
  "back-squat": [80, 5],
  "barbell-romanian-deadlift": [70, 5],
  "leg-extension": [45, 5],
  "lying-leg-curl": [35, 2.5],
  "standing-calf-raise": [60, 5],
};

export async function seedDemoAccount(user: TestUser) {
  const plan = { name: PPL.name, description: PPL.description, workouts: PPL.workouts };
  const { data: splitId } = await user.client.rpc("create_split_from_plan", { p_plan: plan, p_activate: true }).throwOnError();
  await user.client.from("profiles").upsert({ id: user.id, display_name: "Alex" }).throwOnError();
  const { data: templates } = await user.client
    .from("workout_templates")
    .select("id, name, template_exercises(id, exercise_id, target_sets, rep_min, rep_max)")
    .eq("split_id", splitId)
    .order("position")
    .throwOnError();

  const slugById = new Map<string, string>();
  for (const slug of Object.keys(START)) slugById.set(await catalogueId(slug), slug);

  // Targets on for Push, with each exercise's usual increment.
  const push = templates!.find((t) => t.name === "Push")!;
  for (const te of push.template_exercises) {
    await user.client.from("template_exercises").update({ progression_enabled: true, progression_increment_kg: START[slugById.get(te.exercise_id)!][1] }).eq("id", te.id).throwOnError();
  }

  // Progression per exercise: +2 reps per session up to the top of the range, then add weight.
  const state = new Map<string, { w: number; r: number }>();
  const weeks = 12;
  // The split has been active since just before the first sample session.
  await db.query("update public.split_active_periods set started_at = now() - interval '86 days' where user_id = $1", [user.id]);
  for (let week = 0; week < weeks; week++) {
    for (const [i, tpl] of templates!.entries()) {
      const daysAgo = (weeks - week) * 7 - i * 2 + 1;
      const when = new Date(Date.now() - daysAgo * DAY);
      when.setUTCHours(17, 30, 0, 0);
      const { data: doc } = await user.client
        .rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: tpl.id, p_performed_at: when.toISOString() })
        .throwOnError();
      const exercises = doc.exercises.map((ex: { id: string; exercise_id: string; target_sets: number; rep_min: number; rep_max: number }, pos: number) => {
        const slug = slugById.get(ex.exercise_id)!;
        const [w0, inc] = START[slug];
        const s = state.get(slug) ?? { w: w0, r: ex.rep_min + 1 };
        const sets = Array.from({ length: ex.target_sets }, (_, j) => ({
          id: crypto.randomUUID(),
          position: j,
          set_type: "working",
          weight_kg: s.w,
          // Bench keeps every set equal (it is the showcase target); others tire on the last set.
          reps: slug === "barbell-bench-press" || j < ex.target_sets - 1 ? s.r : Math.max(ex.rep_min, s.r - 1),
          completed_at: new Date(when.getTime() + (pos * 8 + j * 2) * 60_000).toISOString(),
        }));
        state.set(slug, s.r >= ex.rep_max ? { w: s.w + inc, r: ex.rep_min + 1 } : { w: s.w, r: Math.min(ex.rep_max, s.r + 2) });
        return { ...ex, position: pos, sets };
      });
      const { data: synced } = await user.client
        .rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: { notes: null, exercises } })
        .throwOnError();
      await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
    }
  }
}
