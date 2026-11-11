import { afterAll, describe, expect, it } from "vitest";
import { catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string, confirmed = true) {
  const id = await createUser(label);
  users.push(id);
  await pool.query("update auth.users set created_at = now() - interval '5 days', email_confirmed_at = $2 where id = $1", [id, confirmed ? new Date().toISOString() : null]);
  return id;
}

/** Logs a Push workout (bench + dips) and moves its finish time back by `hoursAgo`. */
async function trainedPush(uid: string, hoursAgo: number) {
  const split = await createSplit(uid, "PPL");
  const { templateId } = await createTemplate(uid, split, "Push", [{ exerciseId: await catalogueId("barbell-bench-press") }, { exerciseId: await catalogueId("dip") }]);
  const session = await logWorkout(uid, templateId, [
    [
      { weight: 40, reps: 10, done: true, type: "warmup" },
      { weight: 60, reps: 8, done: true },
      { weight: 62.5, reps: 6, done: true },
      { weight: 100, reps: 8, done: false },
    ],
    [{ weight: 0, reps: 10, done: true }],
  ]);
  await pool.query("update workout_sessions set started_at = now() - make_interval(hours => $2 + 1), completed_at = now() - make_interval(hours => $2) where id = $1", [session, hoursAgo]);
  return session;
}

describe("first session email (migration 41)", () => {
  it("picks people whose first workout finished 8–72 hours ago, once, with their best sets", async () => {
    const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
    await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
    try {
      const due = await newUser("first-due");
      const tooSoon = await newUser("first-soon");
      const tooOld = await newUser("first-old");
      const unconfirmed = await newUser("first-unconfirmed", false);
      const untrained = await newUser("first-none");
      await trainedPush(due, 14);
      await trainedPush(tooSoon, 2);
      await trainedPush(tooOld, 100);
      await trainedPush(unconfirmed, 14);
      // A second, more recent workout doesn't make an old first one count again.
      await trainedPush(tooOld, 20);

      // Leave out other test accounts in the local database, so the 200-per-run limit doesn't hide ours.
      await pool.query("update memberships set first_session_emailed_at = now() where first_session_emailed_at is null and user_id <> all($1::uuid[])", [users]);
      const rows = async () => (await pool.query("select * from first_session_emails_due($1)", [SECRET])).rows as { user_id: string; workout_name: string; working_sets: number; weight_unit: string; exercises: { name: string; mode: string; weight_kg: number; reps: number }[] }[];
      const got = await rows();
      const ids = got.map((r) => r.user_id);
      expect(ids).toContain(due);
      for (const id of [tooSoon, tooOld, unconfirmed, untrained]) expect(ids).not.toContain(id);

      const row = got.find((r) => r.user_id === due)!;
      expect(row).toMatchObject({ workout_name: "Push", working_sets: 3, weight_unit: "kg" });
      expect(row.exercises).toHaveLength(2);
      expect(row.exercises[0]).toMatchObject({ name: "Barbell Bench Press", mode: "weight_reps", reps: 6 });
      expect(Number(row.exercises[0].weight_kg)).toBe(62.5);
      expect(row.exercises[1]).toMatchObject({ mode: "added_weight_reps", reps: 10 });

      await expect(pool.query("select * from first_session_emails_due('nope')")).rejects.toThrow(/billing_forbidden/);
      await pool.query("select mark_first_session_emailed($1, $2)", [SECRET, due]);
      expect((await rows()).map((r) => r.user_id)).not.toContain(due);
    } finally {
      await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
    }
  });
});
