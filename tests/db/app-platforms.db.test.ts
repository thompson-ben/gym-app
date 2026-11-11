import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

const row = async (uid: string) => (await pool.query("select signup_platform, first_app_at, last_app_at from user_platforms where user_id = $1", [uid])).rows[0];
const note = (uid: string, platform: string) => as(user(uid), (q) => q("select note_platform($1)", [platform]));

describe("sign-up platform and iPhone app use (migration 40)", () => {
  it("records where a new account was made, keeps it, and tracks app use", async () => {
    const web = await createUser("plat-web");
    const app = await createUser("plat-app");
    const old = await createUser("plat-old");
    const emailInApp = await createUser("plat-email-app");
    const admin = await createUser("plat-admin");
    users.push(web, app, old, emailInApp, admin);
    await pool.query("update auth.users set created_at = now() - interval '3 days' where id = $1", [old]);
    await pool.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"signup_platform":"ios_app"}' where id = $1`, [emailInApp]);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);

    await note(web, "web");
    expect(await row(web)).toMatchObject({ signup_platform: "web", first_app_at: null });
    // Later opening the app doesn't change where they signed up, but counts as app use.
    await note(web, "ios_app");
    expect((await row(web)).signup_platform).toBe("web");
    expect((await row(web)).first_app_at).not.toBeNull();

    await note(app, "ios_app");
    expect((await row(app)).signup_platform).toBe("ios_app");

    // An older account isn't given a sign-up platform.
    await note(old, "web");
    expect((await row(old)).signup_platform).toBeNull();

    // Signed up in the app with email, confirmed in a browser: the form's value wins.
    await note(emailInApp, "web");
    expect((await row(emailInApp)).signup_platform).toBe("ios_app");

    await expect(note(web, "android")).resolves.toBeDefined();
    expect((await row(web)).signup_platform).toBe("web");

    await as({ kind: "anon" }, (q) => q("select track_event('cta_click', '{\"path\":\"/add-weight\",\"detail\":\"ad_app_store\"}'::jsonb)"));
    const f = (await as(user(admin), (q) => q("select admin_app_funnel(1, '{}') as f")))[0].f;
    expect(f.taps_ad_page).toBeGreaterThanOrEqual(1);
    expect(f.signups_app).toBeGreaterThanOrEqual(2);
    expect(f.signups_web).toBeGreaterThanOrEqual(1);
    expect(f.app_users).toBeGreaterThanOrEqual(2);
    await expect(as(user(web), (q) => q("select admin_app_funnel(1, '{}')"))).rejects.toThrow(/not_admin/);
  });
});
