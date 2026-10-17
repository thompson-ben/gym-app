import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});
async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}
const dash = async (admin: string, include: string[] = []) => (await as(user(admin), (q) => q("select admin_dashboard(7, $1::text[]) as d", [include])))[0].d;

describe("admin dashboard (migration 24)", () => {
  it("leaves out admins, free-access friends and test accounts unless included", async () => {
    const admin = await newUser("dash-admin");
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const friend = await newUser("dash-friend");
    await pool.query("update memberships set free_access = true, status = 'founder' where user_id = $1", [friend]);
    const tester = await newUser("dash-test");
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);

    const base = await dash(admin);
    const all = await dash(admin, ["admins", "friends", "tests"]);
    expect(all.overview.accounts - base.overview.accounts).toBeGreaterThanOrEqual(3);
    expect((await dash(admin, ["friends"])).overview.accounts - base.overview.accounts).toBe(base.excluded.friends);
    expect((await dash(admin, ["tests"])).overview.accounts - base.overview.accounts).toBe(base.excluded.tests);

    // A customer's workout and sign-up are counted by default.
    const before = await dash(admin);
    const member = await newUser("dash-member");
    const split = await createSplit(member, "S");
    const { templateId } = await createTemplate(member, split, "W", [{ exerciseId: await catalogueId("dip") }]);
    await logWorkout(member, templateId, [[{ weight: 0, reps: 8, done: true }]]);
    const after = await dash(admin);
    expect(after.overview.accounts - before.overview.accounts).toBe(1);
    expect(after.period.signups - before.period.signups).toBe(1);
    expect(after.period.workouts - before.period.workouts).toBe(1);
    expect(after.funnel.first_workout - before.funnel.first_workout).toBe(1);
    // The friend's workout isn't.
    const fsplit = await createSplit(friend, "S");
    const f = await createTemplate(friend, fsplit, "W", [{ exerciseId: await catalogueId("dip") }]);
    await logWorkout(friend, f.templateId, [[{ weight: 0, reps: 8, done: true }]]);
    expect((await dash(admin)).period.workouts).toBe(after.period.workouts);
    expect((await dash(admin, ["friends"])).period.workouts).toBe(after.period.workouts + 1);
  });

  it("shows how ended trials turned out, and groups sources into channels", async () => {
    const admin = await newUser("dash-admin2");
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const before = await dash(admin);
    const joined = await newUser("trial-joined");
    const left = await newUser("trial-left");
    await pool.query("update memberships set status = 'paid', trial_ends_at = now() - interval '1 day' where user_id = $1", [joined]);
    await pool.query("insert into payments (user_id, stripe_invoice_id, amount_pence, currency, plan, paid_at) values ($1, $2, 399, 'gbp', 'monthly', now())", [joined, `in_dash_${Date.now()}`]);
    await pool.query("update memberships set status = 'trial', trial_ends_at = now() - interval '2 days' where user_id = $1", [left]);
    for (const [uid, src, medium, campaign] of [[joined, "facebook", null, "NL – Test"], [left, "instagram", "story", "train-together"]] as const) {
      await pool.query("insert into user_attribution (user_id, utm_source, utm_medium, utm_campaign) values ($1, $2, $3, $4)", [uid, src, medium, campaign]);
    }

    const d = await dash(admin);
    expect(d.trials.ended - before.trials.ended).toBe(2);
    expect(d.trials.converted - before.trials.converted).toBe(1);
    expect(d.trials.recent.find((t: { email: string }) => t.email.includes("trial-joined")).converted).toBe(true);
    expect(d.trials.recent.find((t: { email: string }) => t.email.includes("trial-left")).converted).toBe(false);
    const ch = (x: typeof d, c: string) => x.channels.find((r: { channel: string }) => r.channel === c);
    expect(ch(d, "meta_ads").signups - ch(before, "meta_ads").signups).toBe(1);
    expect(ch(d, "meta_ads").paid - ch(before, "meta_ads").paid).toBe(1);
    expect(ch(d, "instagram").signups - ch(before, "instagram").signups).toBe(1);

    const stranger = await newUser("dash-stranger");
    await expect(as(user(stranger), (q) => q("select admin_dashboard(7, '{}')"))).rejects.toThrow(/not_admin/);
  });
});
