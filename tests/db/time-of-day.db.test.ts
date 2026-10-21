import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("admin time of day (migration 31)", () => {
  it("counts sign-ups by UK hour and weekday, for admins only, leaving out test accounts unless asked", async () => {
    const admin = await createUser("tod-admin");
    const member = await createUser("tod-member");
    const tester = await createUser("tod-tester");
    users.push(admin, member, tester);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);
    // 7:30pm UK on Wednesday 21 Oct 2026 (BST, so 18:30 UTC).
    await pool.query("update auth.users set created_at = '2026-10-21 18:30:00+00' where id = any($1)", [[member, tester]]);
    const at = async (include: string[]) => (await as(user(admin), (q) => q("select admin_time_of_day(3650, $1) as t", [include])))[0].t;

    await expect(as(user(member), (q) => q("select admin_time_of_day(30)"))).rejects.toThrow(/not_admin/);

    const t = await at([]);
    expect(t.signups.by_hour).toHaveLength(24);
    expect(t.signups.by_weekday).toHaveLength(7);
    expect(t.visits.by_hour).toHaveLength(24);
    expect(t.workouts.by_weekday).toHaveLength(7);
    const base = { hour: t.signups.by_hour[19], wed: t.signups.by_weekday[2] };
    expect(base.hour).toBeGreaterThanOrEqual(1);

    // Ticking test accounts adds the tester at the same hour and weekday.
    const withTests = await at(["tests"]);
    expect(withTests.signups.by_hour[19]).toBe(base.hour + 1);
    expect(withTests.signups.by_weekday[2]).toBe(base.wed + 1);
  });
});
