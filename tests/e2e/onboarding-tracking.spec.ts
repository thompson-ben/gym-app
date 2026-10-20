import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

const count = async (name: string, detail: string | null, path: string) =>
  (
    await db.query(
      "select count(*)::int as n from analytics_events where name = $1 and coalesce(detail, '') = coalesce($2, '') and path = $3 and created_at > now() - interval '2 minutes'",
      [name, detail, path],
    )
  ).rows[0].n as number;

test("button taps, scrolling, demo progress and starting the sign-up form are counted anonymously, and admins see them", async ({ page, browser }) => {
  const before = {
    tap: await count("cta_click", "hero_try", "/add-weight"),
    bottom: await count("scroll_depth", "bottom", "/add-weight"),
    three: await count("demo_progress", "three_sets", "/try"),
    started: await count("signup_started", null, "/sign-in"),
  };
  await page.goto("/add-weight");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => count("scroll_depth", "bottom", "/add-weight")).toBe(before.bottom + 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("link", { name: "Try a workout now" }).first().click();
  await page.waitForURL("**/try");
  await expect.poll(() => count("cta_click", "hero_try", "/add-weight")).toBe(before.tap + 1);

  for (const n of [1, 2, 3]) {
    await page.getByRole("group", { name: `Back squat, set ${n}` }).getByRole("button", { name: /Confirm Back squat/ }).click();
  }
  await expect(page.getByText("3 / 9 sets")).toBeVisible();
  await expect.poll(() => count("demo_progress", "three_sets", "/try")).toBe(before.three + 1);

  await page.goto("/sign-in?mode=sign-up");
  await page.getByLabel("Email").click();
  await page.getByLabel("Password").click();
  // Once per tab session, however many fields are tapped.
  await expect.poll(() => count("signup_started", null, "/sign-in")).toBe(before.started + 1);

  const admin = await newUser("engagement-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  const ctx = await browser.newContext();
  const adminPage = await ctx.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto("/admin?days=1&include=tests");
  await adminPage.locator("summary", { hasText: "More detail" }).click();
  const section = adminPage.getByRole("region", { name: "Before sign-up" });
  await expect(section.getByText(/Ad page \(\/add-weight\)/)).toBeVisible();
  await expect(section.getByText(/Try a workout \(top\) \d+/).first()).toBeVisible();
  await expect(section.getByText(/started filling it in/)).toBeVisible();
  await expect(adminPage.getByText("Started a workout")).toBeVisible();
  await ctx.close();
});
