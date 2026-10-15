import { expect, test } from "@playwright/test";
import { db } from "./helpers";

const INSTAGRAM_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android";

test.afterAll(async () => {
  await db.end();
});

const latest = async (name: string, since: Date) =>
  (await db.query("select detail, in_app from public.analytics_events where name = $1 and created_at >= $2 order by id desc", [name, since])).rows;

test("Continue with Apple / Google start the provider's sign-in and come back to /auth/confirm", async ({ page }) => {
  const since = new Date(Date.now() - 1000);
  // Stand in for Supabase's redirect to Apple (not switched on in the local stack).
  let authorize: URL | null = null;
  await page.route("**/auth/v1/authorize**", async (route) => {
    authorize = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Apple</title><p>Apple sign-in</p>" });
  });

  await page.goto("/sign-in?mode=sign-up&next=/progress");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Apple" }).click();
  await page.waitForURL("**/auth/v1/authorize**");
  expect(authorize!.searchParams.get("provider")).toBe("apple");
  expect(authorize!.searchParams.get("redirect_to")).toMatch(/\/auth\/confirm$/);
  expect(authorize!.searchParams.get("code_challenge")).toBeTruthy();
  const cookies = await page.context().cookies();
  expect(decodeURIComponent(cookies.find((c) => c.name === "sm_next")!.value)).toBe("/progress");
  await expect.poll(() => latest("oauth_start", since)).toEqual([{ detail: "apple", in_app: null }]);

  // Tapping Cancel on Apple's sheet comes back to sign-in with a message.
  await page.goto("/auth/confirm?error=access_denied&error_description=user%20cancelled");
  await page.waitForURL("**/sign-in?error=oauth_cancelled");
  await expect(page.getByText("Sign-in was cancelled")).toBeVisible();
  await page.goto("/auth/confirm?error=server_error&error_description=Unable%20to%20exchange%20external%20code");
  await expect(page.getByText("That sign-in didn't work")).toBeVisible();
});

test.describe("inside the Instagram app", () => {
  test.use({ userAgent: INSTAGRAM_UA });

  test("Google is replaced by how to open a browser, and a blocked sign-up is recorded with its reason", async ({ page }) => {
    const since = new Date(Date.now() - 1000);
    await page.goto("/sign-in?mode=sign-up");
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
    await expect(page.getByText("Google sign-in doesn’t work inside Instagram")).toBeVisible();

    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect.poll(() => latest("signup_error", since)).toEqual([{ detail: "short_password", in_app: "instagram" }]);
    await expect.poll(async () => (await latest("signup_view", since)).filter((e) => e.in_app === "instagram").length).toBe(1);
  });
});
