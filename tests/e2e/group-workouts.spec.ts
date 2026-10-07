import { expect, test } from "@playwright/test";
import { db, expectNoHorizontalScroll, logSet, newUser, seedSplit, signIn } from "./helpers";

test("a host plans a group workout, a friend joins with the link, and each logs their own sets", async ({ page, browser }) => {
  const host = await newUser("together-host");
  const friend = await newUser("together-friend");
  await seedSplit(host, "PPL", "Push", ["barbell-bench-press", "dip"]);

  // Host: plan it from Train.
  await signIn(page, host);
  await page.getByRole("link", { name: /Plan a group workout/ }).click();
  await page.waitForURL("**/together/new");
  await expect(page.getByRole("radio", { name: /Push/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Name", { exact: true }).fill("Thursday push");
  await page.getByLabel("Your name").fill("Ben");
  await page.getByRole("button", { name: "Create and get invite link" }).click();
  await page.waitForURL(/\/together\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Thursday push" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Host edits the plan: one more set of bench press.
  await page.getByRole("group", { name: "Barbell Bench Press working sets" }).getByRole("button", { name: "More sets" }).click();
  await expect(page.getByRole("group", { name: "Barbell Bench Press working sets" })).toContainText("3 sets");
  const invite = (await page.getByLabel("Invite link").textContent())!;
  expect(invite).toMatch(/\/join\/[A-Za-z0-9_-]{20,64}$/);
  const invitePath = new URL(invite).pathname;

  // Friend: opens the link signed out, sees the plan, signs in and joins.
  const friendContext = await browser.newContext({ ...test.info().project.use, colorScheme: "dark" });
  const fp = await friendContext.newPage();
  await fp.goto(invitePath);
  await expect(fp.getByRole("heading", { level: 1, name: "Thursday push" })).toBeVisible();
  await expect(fp.getByText("Ben invited you to train together")).toBeVisible();
  await expect(fp.getByText("3 × 8–12")).toBeVisible();
  await fp.getByRole("link", { name: "I already have an account" }).click();
  await fp.getByLabel("Email").fill(friend.email);
  await fp.getByLabel("Password").fill(friend.password);
  await fp.getByRole("button", { name: "Sign in", exact: true }).click();
  await fp.waitForURL(`**${invitePath}`);
  await fp.getByLabel("Your name").fill("Sam");
  await fp.getByRole("button", { name: "Join group workout" }).click();
  await fp.waitForURL(/\/together\/[0-9a-f-]{36}$/);
  await expect(fp.getByText("Sam (you)")).toBeVisible();
  // Members can't edit the plan or see the invite link.
  await expect(fp.getByRole("button", { name: "More sets" })).toHaveCount(0);
  await expect(fp.getByLabel("Invite link")).toHaveCount(0);

  // Friend trains and finishes.
  await fp.getByRole("button", { name: "Start my workout" }).click();
  await fp.waitForURL("**/workout/**");
  await logSet(fp, "Barbell Bench Press", 1, 8, 50);
  await fp.getByRole("button", { name: "Finish workout" }).click();
  await fp.getByRole("button", { name: "Finish & save" }).click();
  await fp.waitForURL("**/sessions/**");
  await expect(fp.getByText(/Trained with Ben/)).toBeVisible();

  // Host sees that Sam finished, but none of Sam's numbers.
  await page.reload();
  const sam = page.getByRole("listitem").filter({ hasText: "Sam" });
  await expect(sam).toContainText("Finished");
  await expect(page.getByText("50")).toHaveCount(0);
  const { rows } = await db.query(
    "select count(*)::int as n from public.session_sets ss join public.workout_sessions ws on ws.id = (select session_id from public.session_exercises where id = ss.session_exercise_id) where ws.user_id = $1 and ss.weight_kg = 50",
    [friend.id],
  );
  expect(rows[0].n).toBe(1);

  // Train shows the group for the host until they finish it.
  await page.goto("/train");
  await expect(page.getByRole("link", { name: /Thursday push/ })).toBeVisible();
  await friendContext.close();
});

test("an invite link that doesn't exist explains itself", async ({ page }) => {
  await page.goto("/join/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await expect(page.getByRole("heading", { name: "This invite isn’t available" })).toBeVisible();
});
