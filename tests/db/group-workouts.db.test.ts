import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, finish, pool, sync, user, withSets, type SessionDoc } from "./helpers";

const users: string[] = [];
let bench: string;
let row: string;

beforeAll(async () => {
  bench = await catalogueId("barbell-bench-press");
  row = await catalogueId("barbell-row");
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

/** Host with a Push workout: bench (catalogue) and a custom "Belt Squat". */
async function hostWithWorkout() {
  const host = await newUser("group-host");
  const custom = await as(user(host), async (q) =>
    (await q(`insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Belt Squat', 'quads', 'machine') returning id`, [host]))[0].id,
  );
  const split = await createSplit(host, "PPL");
  const { templateId } = await createTemplate(host, split, "Push", [{ exerciseId: bench, sets: 3, repMin: 6, repMax: 10 }, { exerciseId: custom }]);
  const groupId: string = await as(user(host), async (q) =>
    (await q("select create_group_workout('Thursday push', 'Ben', $1) as id", [templateId]))[0].id,
  );
  const { rows: [{ invite_token: token }] } = await pool.query("select invite_token from group_workouts where id = $1", [groupId]);
  return { host, custom, split, templateId, groupId, token: token as string };
}

const startGroup = (uid: string, groupId: string): Promise<SessionDoc> =>
  as(user(uid), async (q) => (await q("select start_group_session($1, $2) as doc", [randomUUID(), groupId]))[0].doc);

const doc = (uid: string, groupId: string) =>
  as(user(uid), async (q) => (await q("select group_workout_document($1) as d", [groupId]))[0].d);

describe("group workouts (migration 12)", () => {
  it("copies the host's workout, previews to anyone with the link, and lets a friend join", async () => {
    const { host, groupId, token } = await hostWithWorkout();
    const preview = await as(anon, async (q) => (await q("select group_invite_preview($1) as p", [token]))[0].p);
    expect(preview).toMatchObject({ name: "Thursday push", host_name: "Ben", member_count: 1, group_id: null });
    expect(preview.exercises.map((e: { name: string }) => e.name)).toEqual(["Barbell Bench Press", "Belt Squat"]);
    expect(JSON.stringify(preview)).not.toContain(host);
    expect(await as(anon, async (q) => (await q("select group_invite_preview('nope') as p"))[0].p)).toBeNull();

    const friend = await newUser("group-friend");
    const stranger = await newUser("group-stranger");
    // Before joining, the group is invisible to them.
    expect(await doc(friend, groupId)).toBeNull();
    expect(await as(user(friend), (q) => q("select * from group_workouts where id = $1", [groupId]))).toHaveLength(0);

    const joined = await as(user(friend), async (q) => (await q("select join_group_workout($1, '  Sam  ') as id", [token]))[0].id);
    expect(joined).toBe(groupId);
    // Joining twice is harmless.
    await as(user(friend), (q) => q("select join_group_workout($1, 'Sam again')", [token]));

    const d = await doc(friend, groupId);
    expect(d.is_host).toBe(false);
    expect(d.invite_token).toBeNull();
    expect(d.members.map((m: { display_name: string; role: string; is_me: boolean }) => [m.display_name, m.role, m.is_me])).toEqual([
      ["Ben", "host", false],
      ["Sam", "member", true],
    ]);
    expect(d.exercises).toHaveLength(2);
    expect(await doc(stranger, groupId)).toBeNull();
    expect((await doc(host, groupId)).invite_token).toBe(token);
  });

  it("only the host edits the plan; nobody can add themselves except through the link", async () => {
    const { host, groupId, token } = await hostWithWorkout();
    const friend = await newUser("group-editor");
    await as(user(friend), (q) => q("select join_group_workout($1, 'Sam')", [token]));

    const updated = await as(user(friend), (q) => q("update group_workout_exercises set target_sets = 9 where group_workout_id = $1 returning id", [groupId]));
    expect(updated).toHaveLength(0);
    await expect(
      as(user(friend), (q) => q("insert into group_workout_exercises (group_workout_id, exercise_id) values ($1, $2)", [groupId, row])),
    ).rejects.toThrow();
    expect(await as(user(friend), (q) => q("update group_workouts set name = 'Mine' where id = $1 returning id", [groupId]))).toHaveLength(0);
    expect(await as(user(friend), (q) => q("delete from group_workouts where id = $1 returning id", [groupId]))).toHaveLength(0);
    const outsider = await newUser("group-outsider");
    await expect(
      as(user(outsider), (q) => q("insert into group_workout_members (group_workout_id, user_id, display_name) values ($1, $2, 'X')", [groupId, outsider])),
    ).rejects.toThrow();

    // The host can.
    const hostEdit = await as(user(host), (q) =>
      q("insert into group_workout_exercises (group_workout_id, exercise_id, position) values ($1, $2, 5) returning id", [groupId, row]),
    );
    expect(hostEdit).toHaveLength(1);
  });

  it("each person logs their own session; status is shared, numbers are not", async () => {
    const { host, custom, templateId, split, groupId, token } = await hostWithWorkout();
    const friend = await newUser("group-logger");
    await as(user(friend), (q) => q("select join_group_workout($1, 'Sam')", [token]));

    const hostDoc = await startGroup(host, groupId);
    // The host's session counts as their Push workout; the custom exercise is their own.
    const { rows: [hostRow] } = await pool.query("select split_id, template_id, template_name, group_workout_id from workout_sessions where id = $1", [hostDoc.id]);
    expect(hostRow).toMatchObject({ split_id: split, template_id: templateId, template_name: "Thursday push", group_workout_id: groupId });
    expect(hostDoc.exercises.map((e) => e.exercise_id)).toEqual([bench, custom]);

    const friendDoc = await startGroup(friend, groupId);
    const { rows: [friendRow] } = await pool.query("select split_id, template_id from workout_sessions where id = $1", [friendDoc.id]);
    expect(friendRow).toEqual({ split_id: null, template_id: null });
    expect(friendDoc.exercises[0].exercise_id).toBe(bench);
    const { rows: [copy] } = await pool.query("select owner_id, name, origin_exercise_id from exercises where id = $1", [friendDoc.exercises[1].exercise_id]);
    expect(copy).toEqual({ owner_id: friend, name: "Belt Squat", origin_exercise_id: custom });

    let members = (await doc(host, groupId)).members;
    expect(members.map((m: { status: string }) => m.status)).toEqual(["in_progress", "in_progress"]);

    const res = await sync(friend, withSets(friendDoc, [[{ weight: 60, reps: 8, done: true }]]), friendDoc.revision);
    await finish(friend, friendDoc.id, res.revision);
    members = (await doc(host, groupId)).members;
    expect(members.map((m: { status: string }) => m.status)).toEqual(["in_progress", "completed"]);

    // The host cannot see the friend's session, sets or exercises.
    expect(await as(user(host), (q) => q("select * from workout_sessions where id = $1", [friendDoc.id]))).toHaveLength(0);
    expect(await as(user(host), (q) => q("select * from session_sets where user_id = $1", [friend]))).toHaveLength(0);
    expect(await as(user(host), (q) => q("select session_document($1) as d", [friendDoc.id])))
      .toEqual([{ d: null }]);
    // A finished group workout cannot be started again by the same person.
    await expect(startGroup(friend, groupId)).rejects.toThrow(/group_session_completed/);

    // A later group workout with the same custom exercise reuses the friend's copy (history continues).
    const second: string = await as(user(host), async (q) => (await q("select create_group_workout('Next push', 'Ben', $1) as id", [templateId]))[0].id);
    const { rows: [{ invite_token: token2 }] } = await pool.query("select invite_token from group_workouts where id = $1", [second]);
    await as(user(friend), (q) => q("select join_group_workout($1, 'Sam')", [token2]));
    const again = await startGroup(friend, second);
    expect(again.exercises[1].exercise_id).toBe(friendDoc.exercises[1].exercise_id);
  });

  it("members can leave, the host can remove members, and deleting the group keeps everyone's history", async () => {
    const { host, groupId, token } = await hostWithWorkout();
    const a = await newUser("group-a");
    const b = await newUser("group-b");
    await as(user(a), (q) => q("select join_group_workout($1, 'A')", [token]));
    await as(user(b), (q) => q("select join_group_workout($1, 'B')", [token]));

    const aDoc = await startGroup(a, groupId);
    const res = await sync(a, withSets(aDoc, [[{ weight: 50, reps: 10, done: true }]]), aDoc.revision);
    await finish(a, aDoc.id, res.revision);

    // B leaves.
    await as(user(b), (q) => q("delete from group_workout_members where group_workout_id = $1 and user_id = $2", [groupId, b]));
    expect(await doc(b, groupId)).toBeNull();
    // A member cannot remove someone else.
    await as(user(a), (q) => q("delete from group_workout_members where group_workout_id = $1 and role = 'host'", [groupId]));
    expect((await doc(host, groupId)).members).toHaveLength(2);
    // The host removes A by its opaque key.
    const key = (await doc(host, groupId)).members.find((m: { display_name: string }) => m.display_name === "A").member_key;
    await as(user(host), (q) => q("select remove_group_member($1, $2)", [groupId, key]));
    expect((await doc(host, groupId)).members).toHaveLength(1);

    await as(user(host), (q) => q("delete from group_workouts where id = $1", [groupId]));
    const { rows: [kept] } = await pool.query("select status, group_workout_id from workout_sessions where id = $1", [aDoc.id]);
    expect(kept).toEqual({ status: "completed", group_workout_id: null });
  });

  it("a group holds at most 10 people and needs a display name", async () => {
    const { token } = await hostWithWorkout();
    const nameless = await newUser("group-nameless");
    await expect(as(user(nameless), (q) => q("select join_group_workout($1, '   ')", [token]))).rejects.toThrow(/display_name_required/);
    for (let i = 0; i < 9; i++) {
      const u = await newUser(`group-fill-${i}`);
      await as(user(u), (q) => q("select join_group_workout($1, $2)", [token, `P${i}`]));
    }
    const late = await newUser("group-late");
    await expect(as(user(late), (q) => q("select join_group_workout($1, 'Late')", [token]))).rejects.toThrow(/group_full/);
  });
});
