import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

test("a visit from a tagged ad link is counted and credited to the account that signs up; only admins see the dashboard", async ({ page }) => {
  const campaign = `e2e-${Date.now()}`;
  await page.goto(`/?utm_source=facebook&utm_medium=paid&utm_campaign=${campaign}&fbclid=IwAR-secret`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(async () => (await db.query("select utm_source, from_meta_ad, path from public.analytics_events where utm_campaign = $1", [campaign])).rows)
    .toEqual([{ utm_source: "facebook", from_meta_ad: true, path: "/" }]);
  // The click id is never stored anywhere.
  const cookie = (await page.context().cookies()).find((c) => c.name === "nl_src");
  expect(decodeURIComponent(cookie!.value)).toContain(campaign);
  expect(decodeURIComponent(cookie!.value)).not.toContain("IwAR-secret");

  // A new account signs in from this browser: the campaign is attached to it, once.
  const user = await newUser("analytics");
  await signIn(page, user);
  await expect
    .poll(async () => (await db.query("select utm_campaign, landing_path from public.user_attribution where user_id = $1", [user.id])).rows)
    .toEqual([{ utm_campaign: campaign, landing_path: "/" }]);
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "nl_src")).toBe(false);

  // Not an admin: no link, and the page doesn't exist for them.
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: /Admin dashboard/ })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign-up funnel" })).toHaveCount(0);

  // Made an admin: the dashboard shows the campaign with its visit and sign-up.
  await db.query("insert into public.admins (user_id) values ($1)", [user.id]);
  await page.goto("/profile");
  await page.getByRole("link", { name: /Admin dashboard/ }).click();
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { name: "From visit to paying" })).toBeVisible();
  await page.locator("summary", { hasText: "More detail" }).click();
  const row = page.getByRole("region", { name: "Every source and campaign" }).getByRole("row").filter({ hasText: campaign });
  await expect(row).toContainText("facebook");
  await expect(row.getByRole("cell").nth(1)).toHaveText("1");
  await expect(row.getByRole("cell").nth(2)).toHaveText("1");
  await page.getByRole("link", { name: "7 days" }).click();
  await expect(page).toHaveURL(/days=7/);
  // Today: the campaign's visit and sign-up happened just now.
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/days=1/);
  await expect(page.getByText(/signed up today and how far/)).toBeVisible();
  // "More detail" stays open while switching range.
  await expect(page.locator("details").filter({ has: page.locator("summary", { hasText: "More detail" }) })).toHaveAttribute("open", "");
  await expect(page.getByRole("region", { name: "Every source and campaign" }).getByRole("row").filter({ hasText: campaign }).getByRole("cell").nth(2)).toHaveText("1");
});

test("browsers with Global Privacy Control are not counted", async ({ browser }) => {
  const context = await browser.newContext({ ...test.info().project.use });
  await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true }));
  const page = await context.newPage();
  const campaign = `e2e-gpc-${Date.now()}`;
  await page.goto(`/?utm_source=facebook&utm_campaign=${campaign}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await db.query("select count(*)::int as n from public.analytics_events where utm_campaign = $1", [campaign])).rows[0].n).toBe(0);
  expect((await context.cookies()).some((c) => c.name === "nl_src")).toBe(false);
  await context.close();
});

test("activation shows sign-ups by campaign, and test accounts can be left out", async ({ page }) => {
  const campaign = `e2e-act-${Date.now()}`;
  const admin = await newUser("act-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  const member = await newUser("act-member");
  await db.query("insert into public.user_attribution (user_id, utm_source, utm_campaign) values ($1, 'instagram', $2)", [member.id, campaign]);

  await signIn(page, admin);
  await page.goto("/admin");
  await page.locator("summary", { hasText: "More detail" }).click();
  await page.locator("summary", { hasText: "Manage" }).click();
  const section = page.getByRole("region", { name: "Activation by campaign" });
  await expect(section.getByRole("row").filter({ hasText: campaign })).toContainText("instagram");

  const tests = page.getByRole("region", { name: "Test accounts" });
  await tests.getByLabel("Test account email").fill(member.email.toUpperCase());
  await tests.getByRole("button", { name: "Exclude" }).click();
  await expect(section.getByRole("row").filter({ hasText: campaign })).toHaveCount(0);
  await expect(tests.getByText(member.email)).toBeVisible();

  await tests.getByRole("button", { name: `Include ${member.email} again` }).click();
  await expect(section.getByRole("row").filter({ hasText: campaign })).toHaveCount(1);
});

test("scrolling to pricing records one anonymous 'saw pricing' event per session", async ({ page }) => {
  const since = new Date().toISOString();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator("#pricing").scrollIntoViewIfNeeded();
  const count = async () => (await db.query("select count(*)::int as n from public.analytics_events where name = 'pricing_view' and created_at >= $1", [since])).rows[0].n;
  await expect.poll(count).toBeGreaterThanOrEqual(1);
  const after = await count();
  // Scrolling away and back in the same tab doesn't count again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("#pricing").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await count()).toBe(after);
});
