import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user, type SetInput } from "./helpers";

const users: string[] = [];
const tag = `act-${Date.now()}`;

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

const activation = (uid: string) => as(user(uid), async (q) => (await q("select admin_activation(30) as a"))[0].a);
const emailOf = async (uid: string) => (await pool.query("select email from auth.users where id = $1", [uid])).rows[0].email as string;

/** Moves an account's sign-up back in time, and its workouts with it. */
async function signedUpDaysAgo(uid: string, days: number) {
  await pool.query("update auth.users set created_at = now() - make_interval(days => $2) where id = $1", [uid, days]);
}

async function workoutOn(uid: string, templateId: string, daysAfterSignup: number, sets: SetInput[][] = [[{ weight: 20, reps: 8, done: true }]]) {
  const id = await logWorkout(uid, templateId, sets);
  await pool.query(
    "update workout_sessions s set created_at = u.created_at + make_interval(days => $3) from auth.users u where s.id = $1 and u.id = $2",
    [id, uid, daysAfterSignup],
  );
  return id;
}

describe("activation by sign-up cohort (migration 16)", () => {
  it("is admin-only", async () => {
    const stranger = await newUser("act-stranger");
    await expect(activation(stranger)).rejects.toThrow(/not_admin/);
    await expect(as(user(stranger), (q) => q("select admin_set_test_account('x@example.com', true)"))).rejects.toThrow(/not_admin/);
  });

  it("counts a second workout only on another day, within 7 and 14 days, per campaign, without test accounts", async () => {
    const admin = await newUser("act-admin");
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const dip = await catalogueId("dip");

    // Came back: first workout on day 1, a second the same day (doesn't count), then day 3.
    const keen = await newUser("act-keen");
    await as(user(keen), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "instagram", utm_campaign: tag })]));
    await signedUpDaysAgo(keen, 20);
    const split = await createSplit(keen, "S");
    const { templateId } = await createTemplate(keen, split, "W", [{ exerciseId: dip }]);
    await as(user(keen), (q) => q("select activate_split($1)", [split]));
    await workoutOn(keen, templateId, 1);
    await workoutOn(keen, templateId, 1);
    await workoutOn(keen, templateId, 3);

    // Tried it twice in one sitting, never came back.
    const once = await newUser("act-once");
    await as(user(once), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "instagram", utm_campaign: tag })]));
    await signedUpDaysAgo(once, 20);
    const s2 = await createSplit(once, "S");
    const t2 = (await createTemplate(once, s2, "W", [{ exerciseId: dip }])).templateId;
    await workoutOn(once, t2, 0);
    await workoutOn(once, t2, 0);

    // A finished workout with only warm-up sets doesn't count.
    const empty = await newUser("act-empty");
    await as(user(empty), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "instagram", utm_campaign: tag })]));
    const s3 = await createSplit(empty, "S");
    const t3 = (await createTemplate(empty, s3, "W", [{ exerciseId: dip }])).templateId;
    await workoutOn(empty, t3, 0, [[{ weight: 10, reps: 8, done: true, type: "warmup" }]]);

    // A test account, excluded by the admin.
    const tester = await newUser("act-tester");
    await as(user(tester), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "instagram", utm_campaign: tag })]));
    const testerEmail = await emailOf(tester);
    const res = await as(user(admin), async (q) => (await q("select admin_set_test_account($1, true) as r", [testerEmail.toUpperCase()]))[0].r);
    expect(res).toEqual({ result: "excluded" });
    expect(await as(user(admin), async (q) => (await q("select admin_set_test_account('nobody@example.com', true) as r"))[0].r)).toEqual({ result: "not_found" });

    const a = await activation(admin);
    const row = a.campaigns.find((c: { campaign: string }) => c.campaign === tag);
    expect(row).toEqual({
      source: "instagram",
      campaign: tag,
      signups: 3,
      split: 1,
      first_workout: 2,
      eligible7: 2,
      second7: 1,
      eligible14: 2,
      second14: 1,
      paid: 0,
    });
    expect(a.test_accounts.map((t: { email: string }) => t.email)).toContain(testerEmail);
    // Admins are never in the cohort.
    expect(a.totals.signups).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(a.campaigns)).not.toMatch(/@/);

    // Included again.
    await as(user(admin), (q) => q("select admin_set_test_account($1, false)", [testerEmail]));
    const b = await activation(admin);
    expect(b.campaigns.find((c: { campaign: string }) => c.campaign === tag).signups).toBe(4);
  });
});
