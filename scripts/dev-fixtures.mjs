// DEVELOPMENT FIXTURES ONLY. Creates clearly labelled test accounts on the LOCAL Supabase stack
// for screenshots and manual QA. Refuses to run against anything that is not localhost.
//
//   node scripts/dev-fixtures.mjs
//
// Accounts (password for all: splitmate-fixture):
//   new@fixtures.splitmate.test     no data
//   one@fixtures.splitmate.test     one split, one completed workout
//   active@fixtures.splitmate.test  ~4 weeks of training, two splits, quick workout, custom variant
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = execSync("npx supabase status -o env", { encoding: "utf8" });
const get = (k) => env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m"))?.[1];
const URL = get("API_URL");
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL ?? "")) throw new Error(`Refusing to seed non-local Supabase: ${URL}`);
const admin = createClient(URL, get("SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const PUBLISHABLE = get("PUBLISHABLE_KEY");
const PASSWORD = "splitmate-fixture";
const DAY = 86_400_000;

async function account(email, name) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list.users.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (name) await client.from("profiles").update({ display_name: name }).eq("id", data.user.id);
  return { client, id: data.user.id };
}

const ex = async (client, slug) => (await client.from("exercises").select("id").eq("slug", slug).single()).data.id;

async function split(client, name, workouts, activateDaysAgo) {
  const { data: s } = await client.from("splits").insert({ name }).select("id").single().throwOnError();
  const templates = [];
  for (const [i, w] of workouts.entries()) {
    const { data: t } = await client.from("workout_templates").insert({ split_id: s.id, name: w.name, position: i }).select("id").single().throwOnError();
    for (const [j, e] of w.exercises.entries()) {
      const row = { template_id: t.id, exercise_id: e.id, position: j, target_sets: e.sets, rep_min: e.min, rep_max: e.max, rest_seconds: e.rest ?? null, notes: e.notes ?? null };
      await client.from("template_exercises").insert(row).throwOnError();
      if (e.progression) {
        // Columns added by the progression migration; ignored when it is not applied yet.
        await client.from("template_exercises").update({ progression_enabled: true, progression_increment_kg: e.progression }).eq("template_id", t.id).eq("position", j);
      }
    }
    templates.push(t.id);
  }
  if (activateDaysAgo !== null) await client.rpc("activate_split", { p_split_id: s.id, p_started_at: new Date(Date.now() - activateDaysAgo * DAY).toISOString() }).throwOnError();
  return { id: s.id, templates };
}

/** Logs a completed workout performed `daysAgo` (sets: per exercise [[kg, reps], ...]). */
async function log(client, templateId, daysAgo, sets, { quick, quickExercises } = {}) {
  const sessionId = randomUUID();
  const at = new Date(Date.now() - daysAgo * DAY);
  at.setHours(18, 15, 0, 0);
  const { data: doc } = quick
    ? await client.rpc("start_quick_session", { p_session_id: sessionId, p_name: quick, p_performed_at: at.toISOString() }).throwOnError()
    : await client.rpc("start_session", { p_session_id: sessionId, p_template_id: templateId, p_performed_at: at.toISOString() }).throwOnError();
  const entries = quick
    ? quickExercises.map((e, i) => ({ id: randomUUID(), exercise_id: e.id, template_exercise_id: null, position: i, exercise_name: e.name, target_sets: null, rep_min: null, rep_max: null, rest_seconds: null, template_notes: null, notes: null, skipped: false }))
    : doc.exercises;
  const payload = {
    notes: null,
    exercises: entries.map((e, i) => ({
      ...e,
      position: i,
      sets: (sets[i] ?? []).map(([kg, reps, type], j) => ({ id: randomUUID(), position: j, set_type: type ?? "working", weight_kg: kg, reps, completed_at: at.toISOString() })),
    })),
  };
  const { data: r } = await client.rpc("sync_session", { p_session_id: sessionId, p_base_revision: doc.revision, p_write_id: randomUUID(), p_doc: payload }).throwOnError();
  await client.rpc("finish_session", { p_session_id: sessionId, p_expected_revision: r.revision }).throwOnError();
}

// --- new: nothing --------------------------------------------------------------------------
await account("new@fixtures.splitmate.test");

// --- one: a single session ----------------------------------------------------------------
{
  const { client } = await account("one@fixtures.splitmate.test", "Sam");
  const s = await split(client, "Full body", [
    { name: "Full Body A", exercises: [
      { id: await ex(client, "back-squat"), sets: 3, min: 5, max: 8 },
      { id: await ex(client, "barbell-bench-press"), sets: 3, min: 6, max: 10 },
      { id: await ex(client, "seated-cable-row"), sets: 3, min: 8, max: 12 },
    ] },
    { name: "Full Body B", exercises: [
      { id: await ex(client, "conventional-deadlift"), sets: 2, min: 3, max: 6 },
      { id: await ex(client, "barbell-overhead-press"), sets: 3, min: 6, max: 10 },
    ] },
  ], 3);
  await log(client, s.templates[0], 2, [[[80, 8], [80, 7], [80, 6]], [[60, 10], [60, 9], [60, 8]], [[55, 12], [55, 12], [55, 11]]]);
}

// --- active: a realistic user ---------------------------------------------------------------
{
  const { client, id } = await account("active@fixtures.splitmate.test", "Alex");
  const { data: hs } = await client
    .from("exercises")
    .insert({ owner_id: id, name: "Chest Press", variant: "Gym A · Hammer Strength", primary_muscle: "chest", equipment: "machine", tracking_mode: "weight_reps" })
    .select("id").single().throwOnError();
  const E = {
    incline: await ex(client, "incline-barbell-bench-press"), pulldown: await ex(client, "lat-pulldown"), dip: await ex(client, "dip"),
    ez: await ex(client, "ez-bar-curl"), push: await ex(client, "triceps-pushdown"), squat: await ex(client, "back-squat"),
    rdl: await ex(client, "barbell-romanian-deadlift"), curl: await ex(client, "lying-leg-curl"), calf: await ex(client, "standing-calf-raise"),
    row: await ex(client, "barbell-row"), ohp: await ex(client, "seated-dumbbell-shoulder-press"), lateral: await ex(client, "cable-lateral-raise"),
    press: hs.id, hack: await ex(client, "hack-squat"), legext: await ex(client, "leg-extension"),
  };
  // An earlier split, active before the current one.
  const old = await split(client, "Push Pull Legs (summer)", [
    { name: "Push", exercises: [{ id: E.incline, sets: 3, min: 6, max: 10 }, { id: E.dip, sets: 2, min: 8, max: 12 }] },
    { name: "Pull", exercises: [{ id: E.pulldown, sets: 3, min: 8, max: 12 }] },
  ], 60);
  await log(client, old.templates[0], 45, [[[65, 9], [65, 8], [65, 7]], [[0, 12], [0, 10]]]);
  await log(client, old.templates[1], 43, [[[62.5, 12], [62.5, 11], [62.5, 10]]]);

  const cur = await split(client, "Upper / Lower — four-day hypertrophy block (autumn)", [
    { name: "Upper A", exercises: [
      { id: E.incline, sets: 3, min: 6, max: 10, rest: 150, progression: 2.5, notes: "Bench at 30°, pause on chest" },
      { id: E.pulldown, sets: 3, min: 8, max: 12, rest: 120, progression: 2.5 },
      { id: E.dip, sets: 2, min: 8, max: 12, rest: 120 },
      { id: E.ez, sets: 2, min: 10, max: 15, rest: 90, progression: 2.5 },
    ] },
    { name: "Lower A", exercises: [
      { id: E.squat, sets: 3, min: 5, max: 8, rest: 180, progression: 5 },
      { id: E.rdl, sets: 3, min: 8, max: 10, rest: 150 },
      { id: E.curl, sets: 2, min: 10, max: 15 },
      { id: E.calf, sets: 3, min: 15, max: 20, rest: 60 },
    ] },
    { name: "Upper B", exercises: [
      { id: E.press, sets: 3, min: 8, max: 12, progression: 5 },
      { id: E.row, sets: 3, min: 8, max: 12 },
      { id: E.ohp, sets: 3, min: 8, max: 12 },
      { id: E.lateral, sets: 3, min: 12, max: 20 },
      { id: E.push, sets: 2, min: 10, max: 15 },
    ] },
    { name: "Lower B", exercises: [
      { id: E.hack, sets: 3, min: 8, max: 12 },
      { id: E.legext, sets: 3, min: 10, max: 15 },
      { id: E.curl, sets: 3, min: 10, max: 15 },
    ] },
  ], 26);
  const [ua, la, ub, lb] = cur.templates;
  await log(client, ua, 25, [[[70, 9], [70, 8], [70, 7]], [[65, 12], [65, 11], [65, 10]], [[5, 10], [5, 9]], [[25, 15], [25, 13]]]);
  await log(client, la, 24, [[[100, 8], [100, 7], [100, 6]], [[90, 10], [90, 9], [90, 8]], [[40, 14], [40, 12]], [[80, 20], [80, 18], [80, 16]]]);
  await log(client, ub, 22, [[[60, 12], [60, 11], [60, 10]], [[70, 10], [70, 9], [70, 9]], [[22, 10], [22, 9], [22, 8]], [[7.5, 18], [7.5, 15], [7.5, 14]], [[30, 15], [30, 12]]]);
  await log(client, lb, 21, [[[120, 12], [120, 10], [120, 9]], [[60, 15], [60, 13], [60, 12]], [[40, 14], [40, 12], [40, 11]]]);
  await log(client, ua, 18, [[[72.5, 10], [72.5, 10], [72.5, 10]], [[67.5, 12], [67.5, 12], [67.5, 12]], [[7.5, 10], [7.5, 10]], [[27.5, 14], [27.5, 12]]]);
  await log(client, la, 17, [[[60, 10, "warmup"], [102.5, 8], [102.5, 7], [102.5, 7]], [[92.5, 10], [92.5, 10], [92.5, 9]], [[42.5, 13], [42.5, 12]], [[80, 20], [80, 20], [80, 19]]]);
  await log(client, ub, 15, [[[65, 12], [65, 10], [65, 10]], [[72.5, 10], [72.5, 10], [72.5, 9]], [[24, 9], [24, 9], [24, 8]], [[7.5, 20], [7.5, 18], [7.5, 16]], [[32.5, 13], [32.5, 12]]]);
  // Lower B skipped this week; Upper A done out of order.
  await log(client, ua, 11, [[[75, 8], [75, 8], [75, 7]], [[70, 12], [70, 11], [70, 10]], [[10, 10], [10, 9]], [[27.5, 15], [27.5, 15]]]);
  await log(client, 0, 9, [[[60, 12], [60, 12]], [[30, 15], [30, 14]], [[10, 20], [10, 18]]], {
    quick: "Hotel gym — quick upper",
    quickExercises: [{ id: E.ohp, name: "Seated Dumbbell Shoulder Press" }, { id: E.push, name: "Triceps Pushdown" }, { id: E.lateral, name: "Cable Lateral Raise" }],
  });
  await log(client, la, 7, [[[105, 8], [105, 8], [105, 8]], [[95, 10], [95, 9], [95, 9]], [[45, 12], [45, 12]], [[85, 20], [85, 18], [85, 17]]]);
  await log(client, ub, 4, [[[70, 11], [70, 10], [70, 9]], [[75, 10], [75, 10], [75, 10]], [[24, 10], [24, 10], [24, 9]], [[10, 15], [10, 14], [10, 12]], [[35, 12], [35, 11]]]);
  await log(client, lb, 3, [[[130, 12], [130, 11], [130, 10]], [[65, 15], [65, 13], [65, 12]], [[45, 13], [45, 12], [45, 11]]]);
  await log(client, ua, 1, [[[75, 10], [75, 10], [75, 10]], [[72.5, 12], [72.5, 11], [72.5, 10]], [[10, 12], [10, 11]], [[30, 15], [30, 15]]]);
}
console.log("fixtures ready: new@ / one@ / active@fixtures.splitmate.test (password splitmate-fixture)");
