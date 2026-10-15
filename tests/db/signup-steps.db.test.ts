import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { anon, as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function oauthUser(provider: string, meta: Record<string, unknown>) {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, $4, now(), now())`,
    [id, `${provider}-${id.slice(0, 8)}@test.splitmate`, JSON.stringify({ provider, providers: [provider] }), JSON.stringify(meta)],
  );
  users.push(id);
  return id;
}

describe("sign-up steps and Apple / Google accounts (migration 23)", () => {
  it("records the sign-up form steps anonymously and shows them, with accounts by method, to admins only", async () => {
    const admin = await createUser("steps-admin");
    users.push(admin);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const steps = async () => (await as(user(admin), (q) => q("select admin_signup_steps(1) as s")))[0].s;
    const before = await steps();

    await as(anon, (q) => q("select track_event('signup_view', $1)", [JSON.stringify({ path: "/sign-in", in_app: "instagram" })]));
    await as(anon, (q) => q("select track_event('signup_submit', '{}')"));
    await as(anon, (q) => q("select track_event('oauth_start', $1)", [JSON.stringify({ detail: "apple" })]));
    await as(anon, (q) => q("select track_event('signup_error', $1)", [JSON.stringify({ detail: "short_password" })]));
    // Anything that isn't a short reason code is dropped, and unknown in-app values too.
    await as(anon, (q) => q("select track_event('signup_error', $1)", [JSON.stringify({ detail: "me@example.com", in_app: "tiktok-ish" })]));
    await oauthUser("apple", {});
    await oauthUser("google", { full_name: "Sam Lifter" });

    const after = await steps();
    expect(after.views - before.views).toBe(1);
    expect(after.views_in_app - before.views_in_app).toBe(1);
    expect(after.submits - before.submits).toBe(1);
    expect(after.oauth_apple - before.oauth_apple).toBe(1);
    expect(after.methods.apple - before.methods.apple).toBe(1);
    expect(after.methods.google - before.methods.google).toBe(1);
    const count = (s: { errors: { reason: string; count: number }[] }, r: string) => s.errors.find((e) => e.reason === r)?.count ?? 0;
    expect(count(after, "short_password") - count(before, "short_password")).toBe(1);
    expect(count(after, "other") - count(before, "other")).toBe(1);
    const stored = await pool.query("select detail, in_app from analytics_events where name = 'signup_error' order by id desc limit 1");
    expect(stored.rows[0]).toEqual({ detail: null, in_app: null });

    const stranger = await createUser("steps-stranger");
    users.push(stranger);
    await expect(as(user(stranger), (q) => q("select admin_signup_steps(7)"))).rejects.toThrow(/not_admin/);
  });

  it("starts Apple / Google accounts with the shared name and the usual trial, and leaves email sign-ups unnamed", async () => {
    const named = await oauthUser("google", { full_name: "  Sam Lifter  " });
    const hidden = await oauthUser("apple", {});
    const email = await createUser("steps-email");
    users.push(email);
    const profile = async (id: string) => (await pool.query("select display_name from profiles where id = $1", [id])).rows[0].display_name;
    expect(await profile(named)).toBe("Sam Lifter");
    expect(await profile(hidden)).toBeNull();
    expect(await profile(email)).toBeNull();
    const m = await pool.query("select count(*)::int as n from memberships where user_id = any($1)", [[named, hidden]]);
    expect(m.rows[0].n).toBe(2);
  });
});
