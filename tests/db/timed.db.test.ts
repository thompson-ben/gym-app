import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, startSession, sync, user, withSets } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

const setsOf = async (sessionId: string) =>
  (await pool.query(
    "select ss.weight_kg, ss.reps from session_sets ss join session_exercises se on se.id = ss.session_exercise_id where se.session_id = $1 order by se.position, ss.position",
    [sessionId],
  )).rows.map((r) => ({ weight: r.weight_kg === null ? null : Number(r.weight_kg), seconds: r.reps }));

describe("timed exercises (migration 20)", () => {
  it("adds holds to the catalogue with seconds-based tracking", async () => {
    const { rows } = await pool.query("select slug, tracking_mode from exercises where slug in ('front-lever', 'plank', 'dead-hang', 'l-sit') order by slug");
    expect(rows).toEqual([
      { slug: "dead-hang", tracking_mode: "added_weight_duration" },
      { slug: "front-lever", tracking_mode: "duration" },
      { slug: "l-sit", tracking_mode: "duration" },
      { slug: "plank", tracking_mode: "added_weight_duration" },
    ]);
  });

  it("logs seconds for holds, with no weight for bodyweight holds and bodyweight (0) by default for loaded ones", async () => {
    const sam = await newUser("timed-sam");
    const split = await createSplit(sam, "Skill");
    const { templateId } = await createTemplate(sam, split, "Monday", [
      { exerciseId: await catalogueId("front-lever"), sets: 3, repMin: 10, repMax: 15 },
      { exerciseId: await catalogueId("plank"), sets: 1, repMin: 60, repMax: 120 },
    ]);
    const sessionId = await logWorkout(sam, templateId, [
      [{ weight: 20, reps: 15, done: true }, { weight: null, reps: 12, done: true }],
      [{ weight: null, reps: 125, done: true }],
    ]);
    expect(await setsOf(sessionId)).toEqual([
      { weight: null, seconds: 15 },
      { weight: null, seconds: 12 },
      { weight: 0, seconds: 125 },
    ]);
    const doc = await as(user(sam), async (q) => (await q("select session_document($1) as d", [sessionId]))[0].d);
    expect(doc.exercises.map((e: { tracking_mode: string; rep_max: number }) => [e.tracking_mode, e.rep_max])).toEqual([["duration", 15], ["added_weight_duration", 120]]);
  });

  it("allows ranges and sets above the rep limits only for timed exercises", async () => {
    const jo = await newUser("timed-jo");
    const split = await createSplit(jo, "S");
    await expect(createTemplate(jo, split, "Bad", [{ exerciseId: await catalogueId("dip"), repMin: 90, repMax: 120 }])).rejects.toThrow(/rep_range_too_high/);
    const { templateId } = await createTemplate(jo, split, "Mixed", [
      { exerciseId: await catalogueId("dip"), sets: 1 },
      { exerciseId: await catalogueId("dead-hang"), sets: 1, repMin: 60, repMax: 300 },
    ]);
    const doc = await startSession(jo, templateId);
    await expect(sync(jo, withSets(doc, [[{ weight: 0, reps: 1500, done: true }], []]), doc.revision)).rejects.toThrow(/reps_too_high/);
    const ok = await sync(jo, withSets(doc, [[{ weight: 0, reps: 10, done: true }], [{ weight: 10, reps: 3600, done: true }]]), doc.revision);
    expect(ok.revision).toBeGreaterThan(doc.revision);
    await expect(sync(jo, withSets(doc, [[], [{ weight: 0, reps: 3601, done: true }]]), ok.revision)).rejects.toThrow();
  });

  it("won't switch an exercise between reps and seconds once it has history", async () => {
    const ben = await newUser("timed-ben");
    const make = (name: string) =>
      as(user(ben), async (q) =>
        (await q("insert into exercises (owner_id, name, primary_muscle, equipment, tracking_mode) values ($1, $2, 'core', 'bodyweight', 'bodyweight_reps') returning id", [ben, name]))[0].id as string,
      );
    const used = await make("Skin the cat");
    const fresh = await make("Tuck hold");
    const split = await createSplit(ben, "S");
    const { templateId } = await createTemplate(ben, split, "W", [{ exerciseId: used, sets: 1 }]);
    await logWorkout(ben, templateId, [[{ weight: null, reps: 5, done: true }]]);

    const setMode = (id: string, mode: string) => as(user(ben), (q) => q("update exercises set tracking_mode = $2 where id = $1", [id, mode]));
    await expect(setMode(used, "duration")).rejects.toThrow(/tracking_mode_in_use/);
    await setMode(used, "added_weight_reps"); // reps to reps is fine
    await setMode(fresh, "duration"); // no history yet
    expect((await pool.query("select tracking_mode from exercises where id = $1", [fresh])).rows[0].tracking_mode).toBe("duration");
  });

  it("leaves timed sets out of the volume in the trial reminder email", async () => {
    const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
    await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
    try {
      const kim = await newUser("timed-kim");
      await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [kim]);
      await pool.query("update memberships set status = 'trial', trial_ends_at = now() + interval '2 days', trial_reminder_sent_at = null where user_id = $1", [kim]);
      const split = await createSplit(kim, "S");
      const { templateId } = await createTemplate(kim, split, "W", [
        { exerciseId: await catalogueId("dip"), sets: 1 },
        { exerciseId: await catalogueId("dead-hang"), sets: 1, repMin: 30, repMax: 60 },
      ]);
      await logWorkout(kim, templateId, [[{ weight: 10, reps: 8, done: true }], [{ weight: 20, reps: 60, done: true }]]);
      const rows = await as(user(kim), (q) => q("select * from trial_reminders_due($1)", [SECRET]));
      const mine = rows.find((r: { user_id: string }) => r.user_id === kim);
      expect(Number(mine.volume_kg)).toBe(80);
      expect(mine.working_sets).toBe(2);
    } finally {
      await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
    }
  });
});
