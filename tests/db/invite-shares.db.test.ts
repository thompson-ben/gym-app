import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("invite shares (migration 36)", () => {
  it("records shares by members with an invite code, ignores double taps, and counts them for admins only", async () => {
    const admin = await createUser("is-admin");
    const sharer = await createUser("is-sharer");
    const noCode = await createUser("is-nocode");
    const tester = await createUser("is-tester");
    users.push(admin, sharer, noCode, tester);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);
    for (const uid of [sharer, tester]) await as(user(uid), (q) => q("select my_referral_code()"));
    const at = async (include: string[] = []) => (await as(user(admin), (q) => q("select admin_invite_shares(30, $1) as s", [include])))[0].s;
    const before = await at();

    const note = (uid: string, method: string) => as(user(uid), (q) => q("select note_invite_shared($1)", [method]));
    await note(sharer, "share");
    await note(sharer, "copy"); // within 10 seconds: a double tap
    await pool.query("update invite_shares set created_at = now() - interval '1 minute' where user_id = $1", [sharer]);
    await note(sharer, "copy");
    await note(sharer, "tweet"); // not a method
    await note(noCode, "share"); // no invite code
    await note(tester, "share");

    const after = await at();
    expect(after.people).toBe(before.people + 1);
    expect(after.shares).toBe(before.shares + 2);
    expect((await at(["tests"])).shares).toBe(before.shares + 3);
    await expect(as(user(sharer), (q) => q("select admin_invite_shares()"))).rejects.toThrow(/not_admin/);
    await expect(as(user(sharer), (q) => q("select * from invite_shares"))).rejects.toThrow();
  });
});
