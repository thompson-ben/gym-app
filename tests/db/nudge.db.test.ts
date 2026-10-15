import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string, hoursAgo: number, confirmed = true) {
  const id = await createUser(label);
  users.push(id);
  await pool.query("update auth.users set created_at = now() - make_interval(hours => $2), email_confirmed_at = $3 where id = $1", [id, hoursAgo, confirmed ? new Date().toISOString() : null]);
  return id;
}

describe("first-workout nudge (migration 22)", () => {
  it("picks accounts 18–72 hours old that haven't trained, once, with their waiting workout", async () => {
    const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
    await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
    try {
      const fresh = await newUser("nudge-fresh", 5);
      const ready = await newUser("nudge-ready", 20);
      const blank = await newUser("nudge-blank", 30);
      const trained = await newUser("nudge-trained", 30);
      const old = await newUser("nudge-old", 100);
      const unconfirmed = await newUser("nudge-unconfirmed", 30, false);
      await pool.query("update memberships set status = 'trial', trial_ends_at = now() + interval '13 days' where user_id = $1", [ready]);

      // "ready" has an active split whose first workout has exercises.
      const split = await createSplit(ready, "Push / Pull / Legs");
      await createTemplate(ready, split, "Push", [{ exerciseId: await catalogueId("dip") }]);
      await as(user(ready), (q) => q("select activate_split($1)", [split]));
      // "trained" has logged a workout.
      const s2 = await createSplit(trained, "S");
      const { templateId } = await createTemplate(trained, s2, "W", [{ exerciseId: await catalogueId("dip") }]);
      await logWorkout(trained, templateId, [[{ weight: 0, reps: 8, done: true }]]);

      // Leave out other test accounts in the local database, so the 200-per-run limit doesn't hide ours.
      await pool.query("update memberships set first_workout_nudged_at = now() where first_workout_nudged_at is null and user_id <> all($1::uuid[])", [users]);
      const due = async () => (await pool.query("select * from first_workout_nudges_due($1)", [SECRET])).rows as { user_id: string; split_name: string | null; workout_name: string | null; trial_ends_at: string | null }[];
      const rows = await due();
      const ids = rows.map((r) => r.user_id);
      expect(ids).toEqual(expect.arrayContaining([ready, blank]));
      for (const id of [fresh, trained, old, unconfirmed]) expect(ids).not.toContain(id);
      expect(rows.find((r) => r.user_id === ready)).toMatchObject({ split_name: "Push / Pull / Legs", workout_name: "Push" });
      expect(rows.find((r) => r.user_id === ready)!.trial_ends_at).not.toBeNull();
      expect(rows.find((r) => r.user_id === blank)).toMatchObject({ split_name: null, workout_name: null });

      await expect(pool.query("select * from first_workout_nudges_due('nope')")).rejects.toThrow(/billing_forbidden/);
      await pool.query("select mark_first_workout_nudged($1, $2)", [SECRET, ready]);
      expect((await due()).map((r) => r.user_id)).not.toContain(ready);

      // Admin: one nudged, and they trained the next day.
      const admin = await newUser("nudge-admin", 1);
      await pool.query("insert into admins (user_id) values ($1)", [admin]);
      const { templateId: push } = { templateId: (await pool.query("select id from workout_templates where split_id = $1", [split])).rows[0].id as string };
      await logWorkout(ready, push, [[{ weight: 0, reps: 8, done: true }]]);
      const n = (await as(user(admin), (q) => q("select admin_nudges(7) as n")))[0].n;
      expect(n.nudged).toBeGreaterThanOrEqual(1);
      expect(n.trained_3d).toBeGreaterThanOrEqual(1);
      await expect(as(user(blank), (q) => q("select admin_nudges(7)"))).rejects.toThrow(/not_admin/);
      await expect(as(user(blank), (q) => q("select * from first_workout_nudges_due($1)", [SECRET]))).resolves.toBeDefined();
    } finally {
      await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
    }
  });
});
