import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

const importAs = (uid: string, exercises: unknown[], sessions: unknown[], source = "strong") =>
  as(user(uid), (q) => q("select import_workouts($1, $2::jsonb, $3::jsonb) as r", [source, JSON.stringify(exercises), JSON.stringify(sessions)])).then((rows) => rows[0].r);

describe("importing history (migration 38)", () => {
  it("creates completed, backdated workouts, reuses custom exercises and never duplicates", async () => {
    const uid = await createUser("import-member");
    users.push(uid);
    const bench = await catalogueId("barbell-bench-press");
    const plank = await catalogueId("plank");
    await as(user(uid), (q) => q("insert into exercises (owner_id, name, primary_muscle, equipment, tracking_mode) values ($1, 'Cable Woodchop', 'core', 'cable', 'weight_reps')", [uid]));

    const sessions = [
      {
        key: "2024-03-05 18:30:00|Push",
        name: "Push",
        started_at: "2024-03-05T18:30:00Z",
        notes: "Felt good",
        exercises: [
          { exercise_id: bench, notes: "Paused", superset_next: true, sets: [{ set_type: "warmup", weight_kg: 40, reps: 10 }, { set_type: "working", weight_kg: 80, reps: 5 }] },
          { exercise_id: plank, notes: null, superset_next: false, sets: [{ set_type: "working", weight_kg: null, reps: 60 }] },
        ],
      },
    ];
    const first = await importAs(uid, [{ key: "x1", name: "cable woodchop", primary_muscle: "core", equipment: "cable", tracking_mode: "weight_reps" }, { key: "x2", name: "Sled Push", primary_muscle: "full_body", equipment: "other", tracking_mode: "weight_reps" }], sessions);
    expect(first).toMatchObject({ imported: 1, skipped: 0 });

    // The existing custom exercise was reused; the new one belongs to the member.
    const own = await pool.query("select id, name from exercises where owner_id = $1 order by name", [uid]);
    expect(own.rows.map((r) => r.name)).toEqual(["Cable Woodchop", "Sled Push"]);
    expect(first.exercises.x1).toBe(own.rows[0].id);

    const session = (await pool.query("select * from workout_sessions where user_id = $1", [uid])).rows[0];
    expect(session).toMatchObject({ status: "completed", is_backdated: true, template_name: "Push", notes: "Felt good", import_key: "strong:2024-03-05 18:30:00|Push" });
    expect(session.completed_at.toISOString()).toBe("2024-03-05T18:30:00.000Z");
    const sets = await pool.query(
      `select se.exercise_name, se.notes, se.superset_next, ss.set_type, ss.weight_kg::float as w, ss.reps, ss.completed_at is not null as done
       from session_sets ss join session_exercises se on se.id = ss.session_exercise_id where se.session_id = $1 order by se.position, ss.position`,
      [session.id],
    );
    expect(sets.rows).toEqual([
      { exercise_name: "Barbell Bench Press", notes: "Paused", superset_next: true, set_type: "warmup", w: 40, reps: 10, done: true },
      { exercise_name: "Barbell Bench Press", notes: "Paused", superset_next: true, set_type: "working", w: 80, reps: 5, done: true },
      { exercise_name: "Plank", notes: null, superset_next: false, set_type: "working", w: 0, reps: 60, done: true },
    ]);

    // History reads it like any other workout.
    const prev = await as(user(uid), (q) => q("select * from previous_performance($1::uuid[], null)", [[bench]]));
    expect(prev).toHaveLength(1);

    // The same file again: nothing new.
    const again = await importAs(uid, [], sessions);
    expect(again).toMatchObject({ imported: 0, skipped: 1 });
    expect((await pool.query("select count(*)::int as n from workout_sessions where user_id = $1", [uid])).rows[0].n).toBe(1);
  });

  it("checks dates, ownership, sources and membership", async () => {
    const uid = await createUser("import-checks");
    const other = await createUser("import-other");
    users.push(uid, other);
    const bench = await catalogueId("barbell-bench-press");
    const theirs = (await as(user(other), (q) => q("insert into exercises (owner_id, name, primary_muscle, equipment) values ($1, 'Secret Lift', 'chest', 'barbell') returning id", [other])))[0].id;
    const one = (exercise_id: string, started_at = "2024-01-01T10:00:00Z") => [{ key: started_at, name: "W", started_at, notes: null, exercises: [{ exercise_id, notes: null, superset_next: false, sets: [{ set_type: "working", weight_kg: 50, reps: 5 }] }] }];

    await expect(importAs(uid, [], one(bench, "2999-01-01T10:00:00Z"))).rejects.toThrow(/workout_date_in_future/);
    await expect(importAs(uid, [], one(theirs))).rejects.toThrow(/exercise_not_available/);
    await expect(importAs(uid, [], one(bench), "fitbod")).rejects.toThrow(/import_source_unknown/);
    await expect(importAs(uid, [], [{ ...one(bench)[0], exercises: [{ exercise_key: "nope", sets: [] }] }])).rejects.toThrow(/import_exercise_missing/);
    // A failed batch leaves nothing behind.
    expect((await pool.query("select count(*)::int as n from workout_sessions where user_id = $1", [uid])).rows[0].n).toBe(0);

    await pool.query("update memberships set status = 'trial', trial_ends_at = now() - interval '1 day' where user_id = $1", [uid]);
    await expect(importAs(uid, [], one(bench))).rejects.toThrow(/membership_required/);
    await expect(pool.query("set role anon; select import_workouts('strong', '[]', '[]')")).rejects.toThrow(/permission denied/);
    await pool.query("reset role");
  });
});
