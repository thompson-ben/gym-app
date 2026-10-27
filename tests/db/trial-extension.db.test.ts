import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";
let previousHash: string | null = null;

beforeAll(async () => {
  previousHash = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
  await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
});

afterAll(async () => {
  await pool.query("update app_settings set billing_secret_hash = $1 where id", [previousHash]);
  await deleteUsers(users);
  await pool.end();
});

describe("extend untrained trials (migration 35)", () => {
  it("adds 7 days once to confirmed trials ending soon without a workout, and resets the reminder", async () => {
    const idle = await createUser("tx-idle");
    const lapsedToday = await createUser("tx-lapsed");
    const trained = await createUser("tx-trained");
    const later = await createUser("tx-later");
    const unconfirmed = await createUser("tx-unconfirmed");
    const tester = await createUser("tx-tester");
    users.push(idle, lapsedToday, trained, later, unconfirmed, tester);
    await pool.query("update auth.users set email_confirmed_at = now() where id = any($1)", [[idle, lapsedToday, trained, later, tester]]);
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);
    const trial = (uid: string, ends: string) =>
      pool.query(`update memberships set status = 'trial', free_access = false, trial_ends_at = now() + $2::interval, trial_reminder_sent_at = now() where user_id = $1`, [uid, ends]);
    await trial(idle, "2 days");
    await trial(lapsedToday, "-6 hours");
    await trial(trained, "2 days");
    await trial(later, "6 days");
    await trial(unconfirmed, "2 days");
    await trial(tester, "2 days");
    const splitId = await createSplit(trained, "Split");
    const { templateId } = await createTemplate(trained, splitId, "A", [{ exerciseId: await catalogueId("barbell-bench-press") }]);
    await logWorkout(trained, templateId, [[{ weight: 60, reps: 8, done: true }]]);
    const idleSplit = await createSplit(idle, "Upper / Lower");
    await createTemplate(idle, idleSplit, "Upper", [{ exerciseId: await catalogueId("barbell-bench-press") }]);
    await as(user(idle), (q) => q("select activate_split($1)", [idleSplit]));

    await expect(pool.query("select * from extend_untrained_trials('wrong')")).rejects.toThrow();

    const run = async () => (await pool.query("select * from extend_untrained_trials($1)", [SECRET])).rows as { user_id: string; trial_ends_at: Date; split_name: string | null; workout_name: string | null }[];
    const ours = (rows: { user_id: string }[]) => rows.filter((r) => users.includes(r.user_id)).map((r) => r.user_id).sort();
    const first = await run();
    expect(ours(first)).toEqual([idle, lapsedToday].sort());
    expect(first.find((r) => r.user_id === idle)).toMatchObject({ split_name: "Upper / Lower", workout_name: "Upper" });

    const m = async (uid: string) => (await pool.query("select trial_ends_at, trial_reminder_sent_at, trial_extended_at from memberships where user_id = $1", [uid])).rows[0];
    const days = (d: Date) => (new Date(d).getTime() - Date.now()) / 86_400_000;
    expect(days((await m(idle)).trial_ends_at)).toBeCloseTo(9, 1);
    expect(days((await m(lapsedToday)).trial_ends_at)).toBeCloseTo(7, 1);
    expect((await m(idle)).trial_reminder_sent_at).toBeNull();
    expect((await m(trained)).trial_extended_at).toBeNull();

    // Once per account: ending soon again later doesn't extend a second time.
    await pool.query("update memberships set trial_ends_at = now() + interval '1 day' where user_id = $1", [idle]);
    expect(ours(await run())).toEqual([]);
  });
});
