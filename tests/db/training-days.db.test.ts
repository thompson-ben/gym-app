import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string, hoursAgo: number) {
  const id = await createUser(label);
  users.push(id);
  await pool.query("update auth.users set created_at = now() - make_interval(hours => $2), email_confirmed_at = now() where id = $1", [id, hoursAgo]);
  await pool.query("update memberships set status = 'trial', trial_ends_at = now() + interval '10 days' where user_id = $1", [id]);
  return id;
}

async function withSecret(fn: () => Promise<void>) {
  const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
  await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
  try {
    await fn();
  } finally {
    await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
  }
}

async function readySplit(id: string, name = "Upper / Lower", workout = "Upper A") {
  const split = await createSplit(id, name);
  const t = await createTemplate(id, split, workout, [{ exerciseId: await catalogueId("dip") }]);
  await as(user(id), (q) => q("select activate_split($1)", [split]));
  return t.templateId;
}

describe("training days (migration 26)", () => {
  it("people set their own days; values are checked", async () => {
    const a = await newUser("days-a", 1);
    const b = await newUser("days-b", 1);
    await as(user(a), (q) => q("update profiles set training_days = '{1,4}' where id = $1", [a]));
    // RLS: someone else's row is untouched.
    await as(user(a), (q) => q("update profiles set training_days = '{2}' where id = $1", [b]));
    const rows = (await pool.query("select id, training_days from profiles where id = any($1)", [[a, b]])).rows;
    expect(rows.find((r) => r.id === a).training_days).toEqual([1, 4]);
    expect(rows.find((r) => r.id === b).training_days).toBeNull();
    await expect(as(user(a), (q) => q("update profiles set training_days = '{0,8}' where id = $1", [a]))).rejects.toThrow(/check/);
  });

  it("reminds on training days until the first workout, at most 4 times, and never twice a day", async () => {
    await withSecret(async () => {
      const today = Number((await pool.query("select extract(isodow from now() at time zone 'Europe/London')::int as d")).rows[0].d);
      const other = (today % 7) + 1;
      const ready = await newUser("days-ready", 30);
      const blank = await newUser("days-blank", 30);
      const notToday = await newUser("days-not-today", 30);
      const trained = await newUser("days-trained", 30);
      const optedOut = await newUser("days-opted-out", 30);
      const ended = await newUser("days-ended", 30);
      const nudged = await newUser("days-nudged", 30);
      const capped = await newUser("days-capped", 30);
      const fresh = await newUser("days-fresh", 2);
      for (const id of [ready, blank, trained, optedOut, ended, nudged, capped, fresh]) await pool.query("update profiles set training_days = $2 where id = $1", [id, [today]]);
      await pool.query("update profiles set training_days = $2 where id = $1", [notToday, [other]]);
      await readySplit(ready);
      const t = await readySplit(trained);
      await logWorkout(trained, t, [[{ weight: 0, reps: 8, done: true }]]);
      await pool.query("update profiles set reminder_emails = false where id = $1", [optedOut]);
      await pool.query("update memberships set trial_ends_at = now() - interval '1 day' where user_id = $1", [ended]);
      await pool.query("update memberships set first_workout_nudged_at = now() where user_id = $1", [nudged]);
      await pool.query("update memberships set training_reminders_sent = 4 where user_id = $1", [capped]);

      await pool.query("update memberships set training_reminders_sent = 4 where training_reminders_sent < 4 and user_id <> all($1::uuid[])", [users]);
      const due = async () => (await pool.query("select * from training_day_reminders_due($1)", [SECRET])).rows as { user_id: string; split_name: string | null; workout_name: string | null; training_days: number[]; reminders_sent: number }[];
      const rows = await due();
      const ids = rows.map((r) => r.user_id);
      expect(ids).toEqual(expect.arrayContaining([ready, blank]));
      for (const id of [notToday, trained, optedOut, ended, nudged, capped, fresh]) expect(ids).not.toContain(id);
      expect(rows.find((r) => r.user_id === ready)).toMatchObject({ split_name: "Upper / Lower", workout_name: "Upper A", training_days: [today], reminders_sent: 0 });
      expect(rows.find((r) => r.user_id === blank)).toMatchObject({ split_name: null, workout_name: null });

      await expect(pool.query("select * from training_day_reminders_due('nope')")).rejects.toThrow(/billing_forbidden/);
      await pool.query("select mark_training_reminder_sent($1, $2)", [SECRET, ready]);
      expect((await due()).map((r) => r.user_id)).not.toContain(ready);
      const m = (await pool.query("select training_reminders_sent, training_reminder_first_at, training_reminder_last_at from memberships where user_id = $1", [ready])).rows[0];
      expect(m.training_reminders_sent).toBe(1);
      expect(m.training_reminder_first_at).not.toBeNull();
      // The next training day it's due again.
      await pool.query("update memberships set training_reminder_last_at = now() - interval '1 day' where user_id = $1", [ready]);
      expect((await due()).find((r) => r.user_id === ready)?.reminders_sent).toBe(1);
    });
  });

  it("checks in once, 7–14 days after sign-up, with how far they got", async () => {
    await withSecret(async () => {
      const week = await newUser("checkin-week", 8 * 24);
      const early = await newUser("checkin-early", 5 * 24);
      const late = await newUser("checkin-late", 20 * 24);
      const trained = await newUser("checkin-trained", 8 * 24);
      const withSplit = await newUser("checkin-split", 9 * 24);
      await pool.query("update profiles set training_days = '{2,6}' where id = $1", [withSplit]);
      await readySplit(withSplit, "Push / Pull / Legs", "Push");
      const t = await readySplit(trained);
      await logWorkout(trained, t, [[{ weight: 0, reps: 8, done: true }]]);

      // Leave out other test accounts in the local database, so the 200-per-run limit doesn't hide ours.
      await pool.query("update memberships set checkin_emailed_at = now() where checkin_emailed_at is null and user_id <> all($1::uuid[])", [users]);
      const due = async () => (await pool.query("select * from checkin_emails_due($1)", [SECRET])).rows as { user_id: string; has_split: boolean; split_name: string | null; training_days: number[] | null }[];
      const rows = await due();
      const ids = rows.map((r) => r.user_id);
      expect(ids).toEqual(expect.arrayContaining([week, withSplit]));
      for (const id of [early, late, trained]) expect(ids).not.toContain(id);
      expect(rows.find((r) => r.user_id === week)).toMatchObject({ has_split: false, split_name: null, training_days: null });
      expect(rows.find((r) => r.user_id === withSplit)).toMatchObject({ has_split: true, split_name: "Push / Pull / Legs", training_days: [2, 6] });

      await expect(pool.query("select * from checkin_emails_due('nope')")).rejects.toThrow(/billing_forbidden/);
      await pool.query("select mark_checkin_emailed($1, $2)", [SECRET, week]);
      expect((await due()).map((r) => r.user_id)).not.toContain(week);

      // Admin: picked days, the check-in, and a workout after it.
      const admin = await newUser("checkin-admin", 1);
      await pool.query("insert into admins (user_id) values ($1)", [admin]);
      await pool.query("select mark_checkin_emailed($1, $2)", [SECRET, withSplit]);
      const push = (await pool.query("select wt.id from workout_templates wt where wt.user_id = $1", [withSplit])).rows[0].id as string;
      await logWorkout(withSplit, push, [[{ weight: 0, reps: 8, done: true }]]);
      const s = (await as(user(admin), (q) => q("select admin_training_days(7) as s")))[0].s;
      expect(s.picked).toBeGreaterThanOrEqual(1);
      expect(s.by_day).toHaveLength(7);
      expect(s.by_day[1]).toBeGreaterThanOrEqual(1); // Tuesday
      expect(s.checkins).toBeGreaterThanOrEqual(2);
      expect(s.checkins_trained).toBeGreaterThanOrEqual(1);
      await expect(as(user(week), (q) => q("select admin_training_days(7)"))).rejects.toThrow(/not_admin/);
      // Ordinary users can't read the queues without the secret.
      await expect(as(user(week), (q) => q("select * from checkin_emails_due('nope')"))).rejects.toThrow(/billing_forbidden/);
    });
  });
});
