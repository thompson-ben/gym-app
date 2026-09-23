import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  as,
  catalogueId,
  createSplit,
  createTemplate,
  createUser,
  deleteUsers,
  finish,
  logWorkout,
  pool,
  startSession,
  sync,
  user,
  withSets,
} from "./helpers";

const users: string[] = [];
let incline: string;
let pulldown: string;
let dip: string;
let squat: string;

beforeAll(async () => {
  incline = await catalogueId("incline-barbell-bench-press");
  pulldown = await catalogueId("lat-pulldown");
  dip = await catalogueId("dip");
  squat = await catalogueId("back-squat");
});

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

const previous = (uid: string, ids: string[]) =>
  as(user(uid), (q) => q("select * from previous_performance($1::uuid[]) order by exercise_id", [ids]));

describe("A. exercise history is independent of splits and workouts", () => {
  it("shows results logged in split A when starting a workout in split B", async () => {
    const me = await newUser("a");
    const splitA = await createSplit(me, "Split A");
    const { templateId: push } = await createTemplate(me, splitA, "Push", [{ exerciseId: incline }]);
    await logWorkout(me, push, [[
      { weight: 72.5, reps: 9, done: true },
      { weight: 72.5, reps: 6, done: true },
    ]]);

    const splitB = await createSplit(me, "Split B");
    const { templateId: fullBody } = await createTemplate(me, splitB, "Full Body A", [
      { exerciseId: squat },
      { exerciseId: incline, sets: 3, repMin: 6, repMax: 8 },
    ]);
    const doc = await startSession(me, fullBody);
    expect(doc.split_name).toBe("Split B");

    const prev = await previous(me, doc.exercises.map((e) => e.exercise_id));
    expect(prev).toHaveLength(1);
    expect(prev[0].exercise_id).toBe(incline);
    expect(prev[0].template_name).toBe("Push");
    expect(prev[0].split_name).toBe("Split A");
    expect(prev[0].sets).toEqual([
      { set_type: "working", weight_kg: 72.5, reps: 9 },
      { set_type: "working", weight_kg: 72.5, reps: 6 },
    ]);
    // The same exercise carries a different target in this workout.
    expect(doc.exercises[1]).toMatchObject({ target_sets: 3, rep_min: 6, rep_max: 8 });
  });

  it("uses the most recent completed session only, never mixing days or unfinished sessions", async () => {
    const me = await newUser("recent");
    const split = await createSplit(me, "S");
    const { templateId } = await createTemplate(me, split, "Upper", [{ exerciseId: pulldown }]);
    await logWorkout(me, templateId, [[{ weight: 80, reps: 5, done: true }]]); // heavier, older
    await logWorkout(me, templateId, [[{ weight: 70, reps: 12, done: true }, { weight: 70, reps: 8, done: true }]]);

    // An unfinished session with newer data must not count as history.
    const open = await startSession(me, templateId);
    await sync(me, withSets(open, [[{ weight: 100, reps: 1, done: true }]]), open.revision);

    const [prev] = await previous(me, [pulldown]);
    expect(prev.sets).toEqual([
      { set_type: "working", weight_kg: 70, reps: 12 },
      { set_type: "working", weight_kg: 70, reps: 8 },
    ]);
  });
});

describe("B/G. sharing and copying splits", () => {
  it("copies structure and resolves previous performance from the recipient's own history only", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");

    const aliceSplit = await createSplit(alice, "Alice PPL");
    const aliceCustom = await as(user(alice), async (q) =>
      (await q(
        `insert into exercises (owner_id, name, variant, primary_muscle, equipment)
         values ($1, 'Lat Pulldown', 'Gym X plate-loaded', 'back', 'machine') returning id`,
        [alice],
      ))[0].id,
    );
    const { templateId } = await createTemplate(alice, aliceSplit, "Pull", [
      { exerciseId: incline },
      { exerciseId: aliceCustom },
    ]);
    await as(user(alice), (q) => q("update template_exercises set notes = 'Pause at chest' where template_id = $1", [templateId]));
    await logWorkout(alice, templateId, [[{ weight: 100, reps: 5, done: true }], [{ weight: 90, reps: 10, done: true }]]);

    // Bob has his own incline history, and a same-named custom exercise that must not be merged.
    const bobSplit = await createSplit(bob, "Bob old");
    const bobCustom = await as(user(bob), async (q) =>
      (await q(
        `insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Lat Pulldown', 'back', 'machine') returning id`,
        [bob],
      ))[0].id,
    );
    const { templateId: bobTpl } = await createTemplate(bob, bobSplit, "Upper", [{ exerciseId: incline }, { exerciseId: bobCustom }]);
    await logWorkout(bob, bobTpl, [[{ weight: 60, reps: 10, done: true }], [{ weight: 50, reps: 12, done: true }]]);

    const share = await as(user(alice), async (q) =>
      (await q("select * from upsert_split_share($1, 'Alice PPL', 'Three-day split', false)", [aliceSplit]))[0],
    );
    expect(share.token.length).toBeGreaterThanOrEqual(32);

    // Anyone with the token sees only the snapshot: no history, no notes (not included), no ids of sessions.
    const shared = await as(anon, async (q) => (await q("select get_shared_split($1) as s", [share.token]))[0].s);
    const serialized = JSON.stringify(shared);
    expect(shared.name).toBe("Alice PPL");
    expect(serialized).not.toContain("Pause at chest");
    expect(serialized.match(/weight_kg|"reps"|session|completed_at|user_id|email/)?.[0]).toBeUndefined();
    expect(serialized).not.toContain(alice);

    const newSplit = await as(user(bob), async (q) =>
      (await q("select copy_shared_split($1, '{}'::jsonb) as id", [share.token]))[0].id,
    );

    // Copy is not activated, is owned by Bob, and is independent of Alice's split.
    const bobActive = await as(user(bob), (q) => q("select * from split_active_periods"));
    expect(bobActive).toHaveLength(0);
    const copied = await as(user(bob), (q) =>
      q(
        `select te.exercise_id, e.owner_id, e.name, e.origin_exercise_id from workout_templates wt
         join template_exercises te on te.template_id = wt.id join exercises e on e.id = te.exercise_id
         where wt.split_id = $1 order by te.position`,
        [newSplit],
      ),
    );
    expect(copied[0].exercise_id).toBe(incline); // catalogue identity preserved
    expect(copied[1].owner_id).toBe(bob); // custom exercise recreated for Bob...
    expect(copied[1].exercise_id).not.toBe(aliceCustom);
    expect(copied[1].exercise_id).not.toBe(bobCustom); // ...and never silently merged with his own
    expect(copied[1].origin_exercise_id).toBe(aliceCustom);

    // Bob's previous performance comes from his own history; the new custom exercise has none.
    const prev = await previous(bob, copied.map((c) => c.exercise_id));
    expect(prev).toHaveLength(1);
    expect(prev[0].sets).toEqual([{ set_type: "working", weight_kg: 60, reps: 10 }]);

    // Bob can never read Alice's custom exercise or her sets.
    const leaked = await as(user(bob), (q) =>
      q("select id from exercises where id = $1 union all select id from session_sets where user_id = $2", [aliceCustom, alice]),
    );
    expect(leaked).toHaveLength(0);

    // Changing Alice's template later does not alter Bob's copy.
    await as(user(alice), (q) => q("update workout_templates set name = 'Pull v2' where id = $1", [templateId]));
    const bobNames = await as(user(bob), (q) => q("select name from workout_templates where split_id = $1", [newSplit]));
    expect(bobNames).toEqual([{ name: "Pull" }]);

    // Revoking prevents future access but keeps Bob's independent copy.
    await as(user(alice), (q) => q("select revoke_split_share($1)", [share.id]));
    const afterRevoke = await as(anon, async (q) => (await q("select get_shared_split($1) as s", [share.token]))[0].s);
    expect(afterRevoke).toBeNull();
    await expect(
      as(user(bob), (q) => q("select copy_shared_split($1, '{}'::jsonb)", [share.token])),
    ).rejects.toThrow(/share_not_found/);
    const stillThere = await as(user(bob), (q) => q("select id from splits where id = $1", [newSplit]));
    expect(stillThere).toHaveLength(1);
  });

  it("maps a custom exercise only on explicit choice, and only to an exercise the recipient may use", async () => {
    const alice = await newUser("alice2");
    const bob = await newUser("bob2");
    const carol = await newUser("carol2");
    const split = await createSplit(alice, "Custom");
    const aliceCustom = await as(user(alice), async (q) =>
      (await q(`insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Belt Squat', 'quads', 'machine') returning id`, [alice]))[0].id,
    );
    await createTemplate(alice, split, "Legs", [{ exerciseId: aliceCustom }]);
    const { token } = await as(user(alice), async (q) => (await q("select * from upsert_split_share($1, 'Custom', null, false)", [split]))[0]);

    const bobCustom = await as(user(bob), async (q) =>
      (await q(`insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Belt squat (my gym)', 'quads', 'machine') returning id`, [bob]))[0].id,
    );
    const carolCustom = await as(user(carol), async (q) =>
      (await q(`insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Belt Squat', 'quads', 'machine') returning id`, [carol]))[0].id,
    );

    // Mapping to someone else's private exercise is rejected.
    await expect(
      as(user(bob), (q) => q("select copy_shared_split($1, $2::jsonb)", [token, JSON.stringify({ [aliceCustom]: { action: "map", exercise_id: carolCustom } })])),
    ).rejects.toThrow(/mapped_exercise_not_available/);

    const splitId = await as(user(bob), async (q) =>
      (await q("select copy_shared_split($1, $2::jsonb) as id", [token, JSON.stringify({ [aliceCustom]: { action: "map", exercise_id: bobCustom } })]))[0].id,
    );
    const [entry] = await as(user(bob), (q) =>
      q("select te.exercise_id from template_exercises te join workout_templates wt on wt.id = te.template_id where wt.split_id = $1", [splitId]),
    );
    expect(entry.exercise_id).toBe(bobCustom);
  });
});

describe("C. template edits never rewrite history", () => {
  it("keeps the session snapshot and sets after renaming the template and removing an exercise", async () => {
    const me = await newUser("c");
    const split = await createSplit(me, "S");
    const { templateId, entryIds } = await createTemplate(me, split, "Chest & back", [
      { exerciseId: incline },
      { exerciseId: pulldown },
    ]);
    const sessionId = await logWorkout(me, templateId, [
      [{ weight: 72.5, reps: 9, done: true }],
      [{ weight: 70, reps: 12, done: true }],
    ]);

    await as(user(me), async (q) => {
      await q("update workout_templates set name = 'Upper A' where id = $1", [templateId]);
      await q("delete from template_exercises where id = $1", [entryIds[1]]);
      await q("update exercises set name = name where id = $1", [incline]).catch(() => undefined);
    });

    const doc = await as(user(me), async (q) => (await q("select session_document($1) as d", [sessionId]))[0].d);
    expect(doc.template_name).toBe("Chest & back");
    expect(doc.exercises.map((e: { exercise_name: string }) => e.exercise_name)).toEqual([
      "Incline Barbell Bench Press",
      "Lat Pulldown",
    ]);
    expect(doc.exercises[1].template_exercise_id).toBeNull();
    expect(doc.exercises[1].sets[0]).toMatchObject({ weight_kg: 70, reps: 12 });

    // Deleting the whole template (and even the split) keeps the completed session.
    await as(user(me), async (q) => {
      await q("delete from workout_templates where id = $1", [templateId]);
      await q("delete from splits where id = $1", [split]);
    });
    const [row] = await as(user(me), (q) => q("select status, template_id, split_id, template_name from workout_sessions where id = $1", [sessionId]));
    expect(row).toEqual({ status: "completed", template_id: null, split_id: null, template_name: "Chest & back" });
  });

  it("renaming a custom exercise keeps its history", async () => {
    const me = await newUser("rename");
    const custom = await as(user(me), async (q) =>
      (await q(`insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Pendulum squat', 'quads', 'machine') returning id`, [me]))[0].id,
    );
    const split = await createSplit(me, "S");
    const { templateId } = await createTemplate(me, split, "Legs", [{ exerciseId: custom }]);
    await logWorkout(me, templateId, [[{ weight: 40, reps: 10, done: true }]]);
    await as(user(me), (q) => q("update exercises set name = 'Pendulum Squat (Atlantis)' where id = $1", [custom]));
    const [prev] = await previous(me, [custom]);
    expect(prev.sets).toEqual([{ set_type: "working", weight_kg: 40, reps: 10 }]);
  });
});

describe("D. active split periods", () => {
  it("keeps exactly one open period and records distinct periods on re-activation", async () => {
    const me = await newUser("d");
    const a = await createSplit(me, "A");
    const b = await createSplit(me, "B");
    const activate = (id: string) => as(user(me), (q) => q("select * from activate_split($1)", [id]));

    await activate(a);
    await activate(a); // repeated request: no duplicate
    await activate(b);
    await activate(a);
    await activate(a);

    const periods = await as(user(me), (q) => q("select split_id, started_at, ended_at from split_active_periods order by started_at"));
    expect(periods.map((p) => p.split_id)).toEqual([a, b, a]);
    expect(periods.filter((p) => p.ended_at === null)).toHaveLength(1);
    expect(periods[2].ended_at).toBeNull();
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].started_at.getTime()).toBeGreaterThanOrEqual(periods[i - 1].ended_at.getTime());
    }
  });

  it("rejects overlapping or impossible corrections and a second open period", async () => {
    const me = await newUser("d2");
    const a = await createSplit(me, "A");
    const b = await createSplit(me, "B");
    const [pa] = await as(user(me), (q) => q("select * from activate_split($1)", [a]));
    const [pb] = await as(user(me), (q) => q("select * from activate_split($1)", [b]));
    const update = (id: string, s: Date, e: Date | null) =>
      as(user(me), (q) => q("select * from update_active_period($1, $2, $3)", [id, s, e]));

    const closedA = (await as(user(me), (q) => q("select * from split_active_periods where id = $1", [pa.id])))[0];
    await expect(update(pa.id, new Date(Date.now() - 86400e3), new Date(Date.now() - 2 * 86400e3))).rejects.toThrow(/period_range_invalid/);
    await expect(update(pa.id, closedA.started_at, new Date(Date.now() + 3600e3))).rejects.toThrow(/period_ends_in_future|period_overlaps/);
    await expect(update(pb.id, new Date(closedA.started_at.getTime() - 1000), null)).rejects.toThrow(/period_overlaps/);

    // A valid correction: A actually started a week ago.
    const weekAgo = new Date(Date.now() - 7 * 86400e3);
    const [fixed] = await update(pa.id, weekAgo, closedA.ended_at);
    expect(fixed.started_at.getTime()).toBe(weekAgo.getTime());

    // Directly inserting a second open period is blocked by constraints too.
    await expect(
      as(user(me), (q) => q("insert into split_active_periods (split_id, started_at) values ($1, now() - interval '1 year')", [a])),
    ).rejects.toThrow();
  });

  it("archiving an active split requires explicitly ending the period and never deletes history", async () => {
    const me = await newUser("d3");
    const a = await createSplit(me, "A");
    const { templateId } = await createTemplate(me, a, "W", [{ exerciseId: squat }]);
    await as(user(me), (q) => q("select activate_split($1)", [a]));
    await logWorkout(me, templateId, [[{ weight: 100, reps: 5, done: true }]]);

    await expect(as(user(me), (q) => q("select archive_split($1, false)", [a]))).rejects.toThrow(/split_is_active/);
    await as(user(me), (q) => q("select archive_split($1, true)", [a]));
    const [counts] = await as(user(me), (q) =>
      q(`select (select count(*) from split_active_periods where ended_at is null)::int as open,
                (select count(*) from workout_sessions where status = 'completed')::int as sessions`),
    );
    expect(counts).toEqual({ open: 0, sessions: 1 });
    const periods = await as(user(me), (q) => q("select completed_workouts from split_periods($1)", [a]));
    expect(periods).toEqual([{ completed_workouts: "1" }]);
  });
});

describe("E/F. session writes are idempotent and never record unperformed sets", () => {
  it("retries of the same write apply once; stale writes conflict; discarded sessions stay discarded", async () => {
    const me = await newUser("e");
    const split = await createSplit(me, "S");
    const { templateId } = await createTemplate(me, split, "W", [{ exerciseId: incline }]);

    const sessionId = randomUUID();
    const doc = await startSession(me, templateId, sessionId);
    // Retrying start with the same id returns the same session instead of a duplicate.
    const again = await startSession(me, templateId, sessionId);
    expect(again.id).toBe(sessionId);
    await expect(startSession(me, templateId)).rejects.toThrow(/session_in_progress/);

    const edited = withSets(doc, [[{ weight: 72.5, reps: 9, done: true }, { weight: 72.5, reps: 6, done: true }]]);
    const writeId = randomUUID();
    const first = await sync(me, edited, 0, writeId);
    const retry = await sync(me, edited, 0, writeId); // lost response, same write retried
    expect(first).toEqual({ status: "ok", revision: 1 });
    expect(retry).toEqual({ status: "ok", revision: 1 });

    const stale = await sync(me, withSets(doc, [[{ weight: 1, reps: 1, done: true }]]), 0);
    expect(stale.status).toBe("conflict");
    expect(stale.document.exercises[0].sets).toHaveLength(2);

    const [{ n }] = await as(user(me), (q) => q("select count(*)::int as n from session_sets"));
    expect(n).toBe(2);

    await as(user(me), (q) => q("select discard_session($1)", [sessionId]));
    const resurrect = await sync(me, edited, 2, randomUUID());
    expect(resurrect).toEqual({ status: "discarded" });
    const [{ m }] = await as(user(me), (q) => q("select count(*)::int as m from session_sets"));
    expect(m).toBe(0);
  });

  it("finishing drops prefilled but unconfirmed sets and refuses an empty workout", async () => {
    const me = await newUser("f");
    const split = await createSplit(me, "S");
    const { templateId } = await createTemplate(me, split, "W", [{ exerciseId: incline }, { exerciseId: pulldown }]);

    const empty = await startSession(me, templateId);
    const prefilled = withSets(empty, [
      [{ weight: 72.5, reps: null, done: false }, { weight: 72.5, reps: null, done: false }],
      [{ weight: 70, reps: null, done: false }],
    ]);
    const r = await sync(me, prefilled, 0);
    await expect(finish(me, empty.id, r.revision)).rejects.toThrow(/no_completed_sets/);
    await as(user(me), (q) => q("select discard_session($1)", [empty.id]));

    const doc = await startSession(me, templateId);
    const mixed = withSets(doc, [
      [{ weight: 72.5, reps: 9, done: true }, { weight: 72.5, reps: null, done: false }],
      [{ weight: 70, reps: null, done: false }],
    ]);
    const r2 = await sync(me, mixed, 0);
    await expect(finish(me, doc.id, 0)).rejects.toThrow(/revision_mismatch/);
    await finish(me, doc.id, r2.revision);
    await finish(me, doc.id, r2.revision); // duplicate completion is a no-op

    const rows = await as(user(me), (q) =>
      q(`select se.exercise_id, se.skipped, ss.weight_kg, ss.reps from session_exercises se
         left join session_sets ss on ss.session_exercise_id = se.id where se.session_id = $1 order by se.position`, [doc.id]),
    );
    expect(rows).toEqual([
      { exercise_id: incline, skipped: false, weight_kg: "72.50", reps: 9 },
      { exercise_id: pulldown, skipped: true, weight_kg: null, reps: null },
    ]);
  });

  it("validates values by tracking mode", async () => {
    const me = await newUser("vals");
    const split = await createSplit(me, "S");
    const pushUp = await catalogueId("push-up");
    const { templateId } = await createTemplate(me, split, "W", [{ exerciseId: dip }, { exerciseId: pushUp }, { exerciseId: incline }]);
    const doc = await startSession(me, templateId);

    // Added weight: 0 means bodyweight only. Bodyweight: any weight is ignored.
    const ok = await sync(me, withSets(doc, [[{ weight: null, reps: 10, done: true }], [{ weight: 20, reps: 15, done: true }], []]), 0);
    expect(ok.status).toBe("ok");
    const sets = await as(user(me), (q) =>
      q("select se.exercise_id, ss.weight_kg from session_sets ss join session_exercises se on se.id = ss.session_exercise_id order by se.position"),
    );
    expect(sets).toEqual([{ exercise_id: dip, weight_kg: "0.00" }, { exercise_id: pushUp, weight_kg: null }]);

    await expect(sync(me, withSets(doc, [[], [], [{ weight: null, reps: 5, done: true }]]), 1)).rejects.toThrow(/completed_set_requires_weight/);
    await expect(sync(me, withSets(doc, [[], [], [{ weight: -5, reps: 5, done: true }]]), 1)).rejects.toThrow();
    await expect(sync(me, withSets(doc, [[], [], [{ weight: 50, reps: 0, done: true }]]), 1)).rejects.toThrow();
  });
});

describe("H. access control", () => {
  it("unrelated users cannot read or mutate private records, even by submitting ids", async () => {
    const owner = await newUser("owner");
    const intruder = await newUser("intruder");
    const split = await createSplit(owner, "Private");
    const { templateId, entryIds } = await createTemplate(owner, split, "W", [{ exerciseId: incline }]);
    await as(user(owner), (q) => q("select activate_split($1)", [split]));
    const sessionId = await logWorkout(owner, templateId, [[{ weight: 72.5, reps: 9, done: true }]]);

    const visible = await as(user(intruder), (q) =>
      q(`select 'split' from splits union all select 'period' from split_active_periods
         union all select 'template' from workout_templates union all select 'entry' from template_exercises
         union all select 'session' from workout_sessions union all select 'sx' from session_exercises
         union all select 'set' from session_sets union all select 'share' from split_shares
         union all select 'profile' from profiles where id = $1`, [owner]),
    );
    expect(visible).toEqual([]);

    const updated = await as(user(intruder), (q) => q("update splits set name = 'pwned' where id = $1 returning id", [split]));
    expect(updated).toEqual([]);
    const deleted = await as(user(intruder), (q) => q("delete from workout_sessions where id = $1 returning id", [sessionId]));
    expect(deleted).toEqual([]);

    // Attaching own rows to someone else's parents is impossible.
    await expect(
      as(user(intruder), (q) => q("insert into workout_templates (split_id, name) values ($1, 'x')", [split])),
    ).rejects.toThrow();
    await expect(
      as(user(intruder), (q) => q("insert into workout_templates (split_id, name, user_id) values ($1, 'x', $2)", [split, owner])),
    ).rejects.toThrow(/row-level security/);
    await expect(as(user(intruder), (q) => q("select start_session(gen_random_uuid(), $1)", [templateId]))).rejects.toThrow(/template_not_found/);
    await expect(as(user(intruder), (q) => q("select activate_split($1)", [split]))).rejects.toThrow(/split_not_found/);
    await expect(as(user(intruder), (q) => q("select duplicate_split($1)", [split]))).rejects.toThrow(/split_not_found/);
    await expect(as(user(intruder), (q) => q("select upsert_split_share($1, 'x', null, false)", [split]))).rejects.toThrow(/split_not_found/);
    const syncResult = await as(user(intruder), async (q) =>
      (await q("select sync_session($1, 1, gen_random_uuid(), '{}'::jsonb) as r", [sessionId]))[0].r,
    );
    expect(syncResult).toEqual({ status: "not_found" });
    await expect(as(user(intruder), (q) => q("select finish_session($1, 1)", [sessionId]))).rejects.toThrow(/session_not_found/);
    expect(await as(user(intruder), (q) => q("select * from session_document($1)", [sessionId]))).toEqual([{ session_document: null }]);
    expect(await as(user(intruder), (q) => q("select * from previous_performance(array[$1]::uuid[])", [incline]))).toEqual([]);
    expect(await as(user(intruder), (q) => q("select * from exercise_history($1)", [incline]))).toEqual([]);
    expect(await as(user(intruder), (q) => q("select * from split_periods($1)", [split]))).toEqual([]);

    // Hijacking a set id that belongs to another user fails.
    const [victimSet] = await pool.query("select ss.id from session_sets ss where ss.user_id = $1", [owner]).then((r) => r.rows);
    const { templateId: myTpl } = await createTemplate(intruder, await createSplit(intruder, "Mine"), "W", [{ exerciseId: incline }]);
    const mine = await startSession(intruder, myTpl);
    const hijack = withSets(mine, [[{ weight: 1, reps: 1, done: true }]]);
    hijack.exercises[0].sets[0].id = victimSet.id;
    await expect(sync(intruder, hijack, 0)).rejects.toThrow();
    const [intact] = await pool.query("select weight_kg, reps from session_sets where id = $1", [victimSet.id]).then((r) => r.rows);
    expect(intact).toEqual({ weight_kg: "72.50", reps: 9 });

    // Using another user's template exercise entry or custom exercise is rejected.
    const ownerCustom = await as(user(owner), async (q) =>
      (await q(`insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Secret', 'back', 'machine') returning id`, [owner]))[0].id,
    );
    await expect(
      as(user(intruder), (q) => q("insert into template_exercises (template_id, exercise_id) values ($1, $2)", [myTpl, ownerCustom])),
    ).rejects.toThrow(/exercise_not_available/);
    expect(entryIds).toHaveLength(1);
  });

  it("anonymous visitors can only read a live share by token", async () => {
    const owner = await newUser("anonowner");
    const split = await createSplit(owner, "Shared");
    await createTemplate(owner, split, "W", [{ exerciseId: incline }]);
    await as(user(owner), (q) => q("select upsert_split_share($1, 'Shared', null, false)", [split]));

    for (const table of ["splits", "split_shares", "workout_sessions", "session_sets", "split_active_periods", "profiles"]) {
      await expect(as(anon, (q) => q(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(as(anon, (q) => q("select activate_split($1)", [split]))).rejects.toThrow(/permission denied/);
    await expect(as(anon, (q) => q("select copy_shared_split('x')"))).rejects.toThrow(/permission denied/);
    expect(await as(anon, async (q) => (await q("select get_shared_split('not-a-real-token') as s"))[0].s)).toBeNull();
  });
});
