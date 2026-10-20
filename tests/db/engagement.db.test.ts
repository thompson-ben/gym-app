import { afterAll, describe, expect, it } from "vitest";
import { anon, as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, pool, startSession, sync, user, withSets } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("onboarding tracking (migration 28)", () => {
  it("counts button taps, scroll depth, form starts, cookie choices and demo progress per page", async () => {
    const admin = await createUser("engage-admin");
    users.push(admin);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const read = async () => (await as(user(admin), (q) => q("select admin_engagement(1, '{}') as e")))[0].e;
    const before = await read();
    const track = (name: string, props: Record<string, string>) => as(anon, (q) => q("select track_event($1, $2)", [name, JSON.stringify(props)]));
    await track("cta_click", { path: "/add-weight", detail: "hero_try" });
    await track("cta_click", { path: "/add-weight", detail: "hero_try" });
    await track("cta_click", { path: "/", detail: "nav_start" });
    await track("scroll_depth", { path: "/", detail: "half" });
    await track("signup_started", { path: "/sign-in" });
    await track("consent", { path: "/", detail: "accepted" });
    await track("consent", { path: "/", detail: "declined" });
    await track("demo_progress", { path: "/try", detail: "three_sets" });
    // A detail that isn't a short code is dropped, not stored.
    await track("cta_click", { path: "/", detail: "Robert'); drop table" });
    const after = await read();
    const clicks = (path: string, detail: string, e: typeof after) =>
      (e.clicks as { path: string; detail: string; count: number }[]).find((c) => c.path === path && c.detail === detail)?.count ?? 0;
    expect(clicks("/add-weight", "hero_try", after) - clicks("/add-weight", "hero_try", before)).toBe(2);
    expect(clicks("/", "nav_start", after) - clicks("/", "nav_start", before)).toBe(1);
    expect(clicks("/", "other", after) - clicks("/", "other", before)).toBe(1);
    expect(after.signup_started - before.signup_started).toBe(1);
    expect(after.consent_accepted - before.consent_accepted).toBe(1);
    expect(after.consent_declined - before.consent_declined).toBe(1);
    expect(after.demo_three_sets - before.demo_three_sets).toBe(1);
    await expect(pool.query("insert into analytics_events (name) values ('cta_nope')")).rejects.toThrow(/check/);
  });

  it("counts new accounts that started a workout or ticked a set, and is admin-only", async () => {
    const admin = await createUser("engage-admin2");
    const starter = await createUser("engage-starter");
    const ticker = await createUser("engage-ticker");
    users.push(admin, starter, ticker);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const read = async () => (await as(user(admin), (q) => q("select admin_engagement(1, '{tests}') as e")))[0].e;
    const before = await read();
    for (const id of [starter, ticker]) {
      const split = await createSplit(id, "S");
      const { templateId } = await createTemplate(id, split, "W", [{ exerciseId: await catalogueId("dip") }]);
      const doc = await startSession(id, templateId);
      if (id === ticker) await sync(id, withSets(doc, [[{ weight: 0, reps: 8, done: true }]]), doc.revision);
    }
    const after = await read();
    expect(after.started_workout - before.started_workout).toBe(2);
    expect(after.logged_a_set - before.logged_a_set).toBe(1);
    await expect(as(user(starter), (q) => q("select admin_engagement(7, '{}')"))).rejects.toThrow(/not_admin/);
  });
});
