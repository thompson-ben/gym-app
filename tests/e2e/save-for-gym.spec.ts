import { expect, test } from "@playwright/test";
import { db, logSet, newUser, seedSplit, signIn } from "./helpers";

test("an untouched workout can be saved for the gym, and the card goes once a set is ticked", async ({ page }) => {
  const user = await newUser("save-for-gym");
  await seedSplit(user, "Push / Pull / Legs", "Push", ["barbell-bench-press", "dip"]);
  await signIn(page, user);

  await page.goto("/train");
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.waitForURL("**/workout/**");
  const card = page.getByRole("complementary", { name: "Not at the gym yet?" });
  await expect(card).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
  await card.getByRole("button", { name: "Save it for the gym" }).click();

  // Back on Train with the workout waiting and nothing left in progress.
  await page.waitForURL("**/train?ready=**");
  await expect(page.getByText("is saved for the gym")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Push" })).toBeVisible();
  expect((await db.query("select count(*)::int as n from workout_sessions where user_id = $1 and status <> 'discarded'", [user.id])).rows[0].n).toBe(0);

  // At the gym: the card disappears after the first ticked set (and "I'm at the gym" hides it too).
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.waitForURL("**/workout/**");
  await expect(card).toBeVisible();
  await logSet(page, "Barbell Bench Press", 1, 8, 60);
  await expect(card).toHaveCount(0);
});
