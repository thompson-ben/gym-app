import { afterAll, describe, expect, it } from "vitest";
import { anon, as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
const tag = `test-${Date.now()}`;

afterAll(async () => {
  await pool.query("delete from public.analytics_events where utm_campaign like 'test-%'");
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

const overview = (uid: string) => as(user(uid), async (q) => (await q("select admin_overview(30) as o"))[0].o);

describe("analytics (migration 13)", () => {
  it("anyone can record a visit, but only known event names and clean values are stored", async () => {
    await as(anon, (q) =>
      q("select track_event('visit', $1)", [
        JSON.stringify({ path: "/", utm_source: "Facebook", utm_campaign: tag, from_meta_ad: true, device: "mobile", country: "gb", referrer_host: "L.Facebook.com" }),
      ]),
    );
    await as(anon, (q) => q("select track_event('purchase', '{}')"));
    await as(anon, (q) => q("select track_event('visit', $1)", [JSON.stringify({ utm_campaign: tag, device: "toaster", country: "Britain" })]));
    const { rows } = await pool.query(
      "select name, path, utm_source, from_meta_ad, device, country, referrer_host from analytics_events where utm_campaign = $1 order by id",
      [tag],
    );
    expect(rows).toEqual([
      { name: "visit", path: "/", utm_source: "facebook", from_meta_ad: true, device: "mobile", country: "GB", referrer_host: "l.facebook.com" },
      { name: "visit", path: null, utm_source: null, from_meta_ad: false, device: null, country: null, referrer_host: null },
    ]);
    // Nobody can read or write the tables directly.
    await expect(as(anon, (q) => q("select * from analytics_events limit 1"))).rejects.toThrow();
    const someone = await newUser("analytics-reader");
    await expect(as(user(someone), (q) => q("select * from analytics_events limit 1"))).rejects.toThrow();
    await expect(as(user(someone), (q) => q("select * from user_attribution limit 1"))).rejects.toThrow();
    await expect(as(user(someone), (q) => q("insert into admins (user_id) values ($1)", [someone]))).rejects.toThrow();
  });

  it("records first-touch attribution once per new account", async () => {
    const me = await newUser("analytics-attr");
    await as(user(me), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "facebook", utm_campaign: tag, landing_path: "/" })]));
    await as(user(me), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "google", utm_campaign: "other" })]));
    const { rows } = await pool.query("select utm_source, utm_campaign, landing_path from user_attribution where user_id = $1", [me]);
    expect(rows).toEqual([{ utm_source: "facebook", utm_campaign: tag, landing_path: "/" }]);
    // Signed-out visitors cannot call it.
    await expect(as(anon, (q) => q("select record_attribution('{}')"))).rejects.toThrow();
  });

  it("only admins can see the dashboard; it shows the funnel by campaign", async () => {
    const admin = await newUser("analytics-admin");
    const stranger = await newUser("analytics-stranger");
    await expect(overview(stranger)).rejects.toThrow(/not_admin/);
    expect(await as(user(stranger), async (q) => (await q("select is_admin() as a"))[0].a)).toBe(false);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    expect(await as(user(admin), async (q) => (await q("select is_admin() as a"))[0].a)).toBe(true);

    // A signup from the campaign who logs a workout.
    const recruit = await newUser("analytics-recruit");
    await as(user(recruit), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "facebook", utm_campaign: tag })]));
    const split = await createSplit(recruit, "S");
    const { templateId } = await createTemplate(recruit, split, "W", [{ exerciseId: await catalogueId("dip") }]);
    await logWorkout(recruit, templateId, [[{ weight: 10, reps: 8, done: true }]]);

    const o = await overview(admin);
    expect(o.totals.signups).toBeGreaterThanOrEqual(3);
    expect(o.daily).toHaveLength(30);
    const row = o.sources.find((s: { source: string; campaign: string }) => s.source === "facebook" && s.campaign === tag);
    // 1 visit from the first test (the second had no source), 2 signups (attr + recruit), 1 with a workout.
    expect(row).toEqual({ source: "facebook", campaign: tag, visits: 1, signups: 2, first_workout: 1 });
    expect(JSON.stringify(o)).not.toMatch(/@/); // no emails anywhere
  });
});
