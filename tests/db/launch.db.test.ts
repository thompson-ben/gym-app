import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await pool.query("update app_settings set auto_founder = true where id");
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}
const member = async (uid: string) => (await pool.query("select status, free_access, trial_ends_at, note from memberships where user_id = $1", [uid])).rows[0];
const emailOf = async (uid: string) => (await pool.query("select email from auth.users where id = $1", [uid])).rows[0].email as string;

describe("free access and launch (migration 15)", () => {
  it("separates free access from early access, then launch starts trials only for early access", async () => {
    const admin = await newUser("launch-admin");
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const friend = await newUser("launch-friend");
    const early = await newUser("launch-early");
    const stranger = await newUser("launch-stranger");
    // Everyone signs up as a founder while early access is on.
    expect(await member(early)).toMatchObject({ status: "founder", free_access: false });

    const grant = (email: string) => as(user(admin), async (q) => (await q("select admin_grant_free_access($1, 'Gym buddy') as r", [email]))[0].r);
    expect(await grant(await emailOf(friend))).toMatchObject({ result: "granted" });
    expect(await member(friend)).toMatchObject({ status: "founder", free_access: true });
    expect(await grant(await emailOf(friend))).toMatchObject({ result: "already_free" });
    // The admin keeps themselves free too.
    await grant(await emailOf(admin));

    const list = await as(user(admin), async (q) => (await q("select admin_free_access_list() as l"))[0].l);
    expect(list.live).toBe(false);
    expect(list.free.map((x: { email: string }) => x.email)).toContain(await emailOf(friend));
    expect(list.early.map((x: { email: string }) => x.email)).toContain(await emailOf(early));
    expect(list.early.map((x: { email: string }) => x.email)).not.toContain(await emailOf(friend));

    // Launch needs an admin and the exact confirmation word.
    await expect(as(user(stranger), (q) => q("select admin_launch_paid_plans('LAUNCH')"))).rejects.toThrow(/not_admin/);
    await expect(as(user(admin), (q) => q("select admin_launch_paid_plans('launch')"))).rejects.toThrow(/launch_not_confirmed/);
    const result = await as(user(admin), async (q) => (await q("select admin_launch_paid_plans('LAUNCH') as r"))[0].r);
    expect(result.trial_days).toBe(14);
    const movedEmails = result.moved.map((x: { email: string }) => x.email);
    expect(movedEmails).toContain(await emailOf(early));
    expect(movedEmails).not.toContain(await emailOf(friend));

    const e = await member(early);
    expect(e.status).toBe("trial");
    const days = (new Date(e.trial_ends_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(await member(friend)).toMatchObject({ status: "founder", free_access: true });
    expect(await member(admin)).toMatchObject({ status: "founder", free_access: true });
    expect(await as(user(admin), async (q) => (await q("select paid_plans_live() as l"))[0].l)).toBe(true);

    // New sign-ups now get the trial; running launch again moves nobody else.
    const after = await newUser("launch-after");
    expect((await member(after)).status).toBe("trial");
    const again = await as(user(admin), async (q) => (await q("select admin_launch_paid_plans('LAUNCH') as r"))[0].r);
    expect(again.moved).toEqual([]);

    // Removing free access after launch starts a trial (never locks anyone out on the spot).
    const friendEmail = await emailOf(friend);
    await as(user(admin), (q) => q("select admin_remove_free_access($1)", [friendEmail]));
    expect(await member(friend)).toMatchObject({ status: "trial", free_access: false });
    // And giving it to someone mid-trial makes them free for good.
    expect(await grant(await emailOf(early))).toMatchObject({ result: "granted" });
    expect(await member(early)).toMatchObject({ status: "founder", free_access: true, trial_ends_at: null });
  });
});
