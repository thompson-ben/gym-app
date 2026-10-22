import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("admin trials ending (migration 32)", () => {
  it("groups running trials by UK end day, counts who trained, and is admin-only", async () => {
    const admin = await createUser("te-admin");
    const trained = await createUser("te-trained");
    const idle = await createUser("te-idle");
    const tester = await createUser("te-tester");
    const far = await createUser("te-far");
    users.push(admin, trained, idle, tester, far);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);
    // Ten days out at midday UK time, so the day is unambiguous; one trial ends in 40 days.
    const end = "(date_trunc('day', now() at time zone 'Europe/London') + interval '10 days 12 hours') at time zone 'Europe/London'";
    await pool.query(`update memberships set status = 'trial', free_access = false, trial_ends_at = ${end} where user_id = any($1)`, [[trained, idle, tester]]);
    await pool.query("update memberships set status = 'trial', free_access = false, trial_ends_at = now() + interval '40 days' where user_id = $1", [far]);
    const splitId = await createSplit(trained, "Split");
    const { templateId } = await createTemplate(trained, splitId, "A", [{ exerciseId: await catalogueId("barbell-bench-press") }]);
    await logWorkout(trained, templateId, [[{ weight: 60, reps: 8, done: true }]]);

    await expect(as(user(trained), (q) => q("select admin_trials_ending()"))).rejects.toThrow(/not_admin/);

    const day = (await pool.query("select ((now() at time zone 'Europe/London')::date + 10)::text as d")).rows[0].d;
    const at = async (include: string[]) => (await as(user(admin), (q) => q("select admin_trials_ending($1) as t", [include])))[0].t;
    const pick = (t: { by_day: { day: string; ending: number; trained: number }[] }) => t.by_day.find((d) => d.day === day);

    const base = await at([]);
    expect(pick(base)).toMatchObject({ ending: expect.any(Number), trained: expect.any(Number) });
    const withTests = await at(["tests"]);
    expect(pick(withTests)!.ending).toBe(pick(base)!.ending + 1);
    expect(pick(base)!.trained).toBeGreaterThanOrEqual(1);
    expect(base.later).toBeGreaterThanOrEqual(1);
    expect(base.by_day.every((d: { day: string }) => d.day <= (new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10)))).toBe(true);
  });
});
