import { afterAll, describe, expect, it } from "vitest";
import { anon, as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("try-a-workout demo (migration 27)", () => {
  it("records the demo events anonymously and counts accounts that came from it", async () => {
    const admin = await createUser("demo-admin");
    const fromDemo = await createUser("demo-account");
    const trained = await createUser("demo-trained");
    const other = await createUser("demo-other");
    users.push(admin, fromDemo, trained, other);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"via\": \"demo\"}' where id = any($1)", [[fromDemo, trained]]);
    const split = await createSplit(trained, "Full Body (3 days)");
    const { templateId } = await createTemplate(trained, split, "Full Body A", [{ exerciseId: await catalogueId("dip") }]);
    await logWorkout(trained, templateId, [[{ weight: 0, reps: 8, done: true }]]);

    const read = async () => (await as(user(admin), (q) => q("select admin_demo(1) as d")))[0].d as { started: number; logged_set: number; tapped_signup: number; accounts: number; trained: number };
    const before = await read();
    for (const name of ["demo_start", "demo_start", "demo_set", "demo_signup"]) {
      await as(anon, (q) => q("select track_event($1, $2)", [name, JSON.stringify({ path: "/try", device: "mobile" })]));
    }
    // The older events are still accepted.
    await as(anon, (q) => q("select track_event('signup_submit', '{}'::jsonb)"));
    const after = await read();
    expect(after.started - before.started).toBe(2);
    expect(after.logged_set - before.logged_set).toBe(1);
    expect(after.tapped_signup - before.tapped_signup).toBe(1);
    expect(after.accounts).toBeGreaterThanOrEqual(2);
    expect(after.trained).toBeGreaterThanOrEqual(1);
    await expect(as(user(other), (q) => q("select admin_demo(30)"))).rejects.toThrow(/not_admin/);
    await expect(pool.query("insert into analytics_events (name) values ('demo_nope')")).rejects.toThrow(/check/);
  });
});
