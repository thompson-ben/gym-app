import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

test.afterAll(async () => {
  // Launch flips a global setting: put early access back for the rest of the suite.
  await db.query("update public.app_settings set auto_founder = true where id");
});

test("admin keeps friends free, then launch starts 14-day trials for early access only", async ({ page }) => {
  const admin = await newUser("launch-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  await db.query("update public.memberships set free_access = true where user_id = $1", [admin.id]);
  const friend = await newUser("launch-friend");
  const early = await newUser("launch-early");

  await signIn(page, admin);
  await page.goto("/admin");
  // Everyone who signed up during early access is listed; promote the friend.
  await page.getByRole("button", { name: `Give ${friend.email} free access` }).click();
  const freeItem = page.getByRole("listitem").filter({ hasText: friend.email });
  await expect(freeItem.getByRole("button", { name: `Remove free access for ${friend.email}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Give ${early.email} free access` })).toBeVisible();

  // Launch: needs the confirmation word.
  const launch = page.getByRole("button", { name: "Launch paid membership" });
  await expect(launch).toBeDisabled();
  await page.getByLabel("Type LAUNCH to confirm").fill("LAUNCH");
  await launch.click();
  await expect(page.getByRole("status").filter({ hasText: /Launched\. \d+ early-access/ })).toBeVisible();
  await expect(page.getByText("Paid membership is live.")).toBeVisible();

  const status = async (id: string) => (await db.query("select status, free_access, trial_ends_at from public.memberships where user_id = $1", [id])).rows[0];
  expect(await status(friend.id)).toMatchObject({ status: "founder", free_access: true });
  expect(await status(admin.id)).toMatchObject({ status: "founder", free_access: true });
  const e = await status(early.id);
  expect(e.status).toBe("trial");
  expect((new Date(e.trial_ends_at).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(13.9);

  // The early-access member now sees the countdown; the landing page shows the trial and prices.
  const other = await page.context().browser()!.newContext({ ...test.info().project.use });
  const ep = await other.newPage();
  await signIn(ep, early);
  await expect(ep.getByRole("link", { name: /14 days left of your free trial/ })).toBeVisible();
  await other.close();
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Try it free for 14 days." })).toBeVisible();
  await expect(page.getByText("£3.99", { exact: true })).toBeVisible();
});
