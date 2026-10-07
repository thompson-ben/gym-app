import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, newUser, signIn } from "./helpers";

test("signed-out visitors get the landing page; its call to action opens sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Know exactly what to lift next." })).toBeVisible();
  await expect(page).toHaveTitle("NotchLift · Workout planner & tracker");
  await expectNoHorizontalScroll(page);
  // Social previews and search engines.
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(/^https:\/\/notchlift\.com\/opengraph-image\.jpg/);
  const image = await page.request.get(new URL(og!).pathname + new URL(og!).search, { maxRedirects: 0 });
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  expect((await page.request.get("/robots.txt")).status()).toBe(200);
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain("<loc>");

  await page.getByRole("link", { name: "Start training free" }).first().click();
  await page.waitForURL("**/sign-in?mode=sign-up");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("signed-in users skip the landing page", async ({ page }) => {
  await signIn(page, await newUser("landing-skip"));
  await page.goto("/");
  await page.waitForURL("**/train");
});
