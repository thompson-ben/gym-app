import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("admin billing mix (migration 33)", () => {
  it("counts paying members by plan, leaves out test accounts unless asked, and is admin-only", async () => {
    const admin = await createUser("bm-admin");
    const monthly = await createUser("bm-monthly");
    const yearly = await createUser("bm-yearly");
    const tester = await createUser("bm-tester");
    users.push(admin, monthly, yearly, tester);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);
    await pool.query("update memberships set status = 'paid', free_access = false, plan = 'monthly', cancel_at_period_end = true where user_id = $1", [monthly]);
    await pool.query("update memberships set status = 'paid', free_access = false, plan = 'yearly', billing_issue = true where user_id = $1", [yearly]);
    await pool.query("update memberships set status = 'paid', free_access = false, plan = 'monthly', cancel_at_period_end = true where user_id = $1", [tester]);

    await expect(as(user(monthly), (q) => q("select admin_billing_mix()"))).rejects.toThrow(/not_admin/);

    const at = async (include: string[]) => (await as(user(admin), (q) => q("select admin_billing_mix($1) as m", [include])))[0].m;
    const base = await at([]);
    const withTests = await at(["tests"]);
    expect(base).toMatchObject({ monthly: expect.any(Number), yearly: expect.any(Number), canceling: expect.any(Number), billing_issue: expect.any(Number) });
    expect(base.monthly).toBeGreaterThanOrEqual(1);
    expect(base.yearly).toBeGreaterThanOrEqual(1);
    expect(base.billing_issue).toBeGreaterThanOrEqual(1);
    expect(withTests.monthly).toBe(base.monthly + 1);
    expect(withTests.canceling).toBe(base.canceling + 1);
    expect(withTests.yearly).toBe(base.yearly);
  });
});
