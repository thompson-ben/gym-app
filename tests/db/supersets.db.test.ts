import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, pool, startSession, sync, user, withSets } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

type Entry = { exercise_name: string; superset_next: boolean };

describe("supersets (migration 29)", () => {
  it("sessions snapshot the links when they start, keep them through syncs, and ignore later template edits", async () => {
    const alice = await createUser("superset-alice");
    users.push(alice);
    const split = await createSplit(alice, "Upper");
    const { templateId, entryIds } = await createTemplate(alice, split, "Upper A", [
      { exerciseId: await catalogueId("barbell-bench-press") },
      { exerciseId: await catalogueId("barbell-row") },
      { exerciseId: await catalogueId("dip") },
    ]);
    // Bench + row as a superset; people edit the link like any other field (RLS: own rows only).
    await as(user(alice), (q) => q("update template_exercises set superset_next = true where id = $1", [entryIds[0]]));

    const doc = await startSession(alice, templateId);
    expect((doc.exercises as unknown as Entry[]).map((e) => e.superset_next)).toEqual([true, false, false]);

    // Logging sets (sync_session) leaves the links alone.
    const r = await sync(alice, withSets(doc, [[{ weight: 60, reps: 8, done: true }], [], []]), doc.revision);
    expect(r.status).toBe("ok");
    // Editing the template now doesn't change the session that already started.
    await as(user(alice), (q) => q("update template_exercises set superset_next = false where id = $1", [entryIds[0]]));
    const after = (await as(user(alice), (q) => q("select session_document($1) as d", [doc.id])))[0].d;
    expect((after.exercises as Entry[]).map((e) => e.superset_next)).toEqual([true, false, false]);

    // Someone else can't link Alice's exercises.
    const bob = await createUser("superset-bob");
    users.push(bob);
    await as(user(bob), (q) => q("update template_exercises set superset_next = true where id = $1", [entryIds[1]]));
    expect((await pool.query("select superset_next from template_exercises where id = $1", [entryIds[1]])).rows[0].superset_next).toBe(false);
  });

  it("shared, copied, duplicated and ready-made splits carry the links", async () => {
    const owner = await createUser("superset-owner");
    const friend = await createUser("superset-friend");
    users.push(owner, friend);
    const split = await createSplit(owner, "Push");
    const { entryIds } = await createTemplate(owner, split, "Push", [
      { exerciseId: await catalogueId("barbell-bench-press") },
      { exerciseId: await catalogueId("dip") },
    ]);
    await as(user(owner), (q) => q("update template_exercises set superset_next = true where id = $1", [entryIds[0]]));
    const links = async (uid: string, splitId: string) =>
      (
        await pool.query(
          "select te.superset_next from template_exercises te join workout_templates wt on wt.id = te.template_id where wt.split_id = $1 and te.user_id = $2 order by te.position",
          [splitId, uid],
        )
      ).rows.map((r) => r.superset_next);

    const share = await as(user(owner), async (q) => (await q("select * from upsert_split_share($1, 'Push', null, false)", [split]))[0]);
    expect(share.snapshot.workouts[0].exercises.map((x: { superset_next: boolean }) => x.superset_next)).toEqual([true, false]);
    const copied = (await as(user(friend), (q) => q("select copy_shared_split($1, '{}'::jsonb) as id", [share.token])))[0].id;
    expect(await links(friend, copied)).toEqual([true, false]);

    const dup = (await as(user(owner), (q) => q("select duplicate_split($1) as id", [split])))[0].id;
    expect(await links(owner, dup)).toEqual([true, false]);

    const plan = { name: "Plan", description: null, workouts: [{ name: "A", exercises: [{ slug: "dip", sets: 3, rep_min: 8, rep_max: 12, rest_seconds: 60, superset_next: true }, { slug: "barbell-row", sets: 3, rep_min: 8, rep_max: 12, rest_seconds: 60 }] }] };
    const made = (await as(user(friend), (q) => q("select create_split_from_plan($1, false) as id", [JSON.stringify(plan)])))[0].id;
    expect(await links(friend, made)).toEqual([true, false]);
  });
});
