import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("admin glance leaves out test accounts (migration 34)", () => {
  it("counts a customer's cancellation, trial and comment but not a test account's", async () => {
    const admin = await createUser("gl-admin");
    const tester = await createUser("gl-tester");
    users.push(admin, tester);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);
    const glance = async () => (await as(user(admin), (q) => q("select admin_glance() as g")))[0].g;

    const setUp = async (uid: string) => {
      await pool.query("update memberships set status = 'paid', free_access = false, plan = 'monthly', cancel_at_period_end = true where user_id = $1", [uid]);
      await pool.query("insert into feedback (user_id, kind, message) values ($1, 'idea', 'More charts please')", [uid]);
    };
    const trial = (uid: string) => pool.query("update memberships set status = 'trial', free_access = false, trial_ends_at = now() + interval '2 days' where user_id = $1", [uid]);

    const before = await glance();
    await setUp(tester);
    const withTester = await glance();
    expect(withTester.cancelling).toBe(before.cancelling);
    expect(withTester.new_comments).toBe(before.new_comments);
    await trial(tester);
    expect((await glance()).trials_ending_3d).toBe(before.trials_ending_3d);

    const customer = await createUser("gl-customer");
    users.push(customer);
    await setUp(customer);
    const withCustomer = await glance();
    expect(withCustomer.cancelling).toBe(before.cancelling + 1);
    expect(withCustomer.new_comments).toBe(before.new_comments + 1);
    await trial(customer);
    expect((await glance()).trials_ending_3d).toBe(before.trials_ending_3d + 1);
  });
});
