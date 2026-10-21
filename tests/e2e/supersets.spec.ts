import { expect, test } from "@playwright/test";
import { db, logSet, newUser, seedSplit, signIn } from "./helpers";

test("link two exercises as a superset, then log it round by round with rest only after each round", async ({ page }) => {
  const user = await newUser("supersets");
  const { splitId, templateId } = await seedSplit(user, "Upper", "Upper A", ["barbell-bench-press", "barbell-row", "dip"]);
  await db.query("update profiles set auto_start_rest = true where id = $1", [user.id]);
  await signIn(page, user);

  // Link bench with row in the split editor.
  await page.goto(`/splits/${splitId}/workouts/${templateId}`);
  const link = page.getByRole("button", { name: "Superset with next" }).first();
  await link.click();
  await expect(page.getByRole("button", { name: "In a superset with next" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Superset A1")).toBeVisible();
  await expect(page.getByText("Superset A2")).toBeVisible();
  // The last exercise has nothing to link to.
  await expect(page.getByRole("button", { name: /Superset with next|In a superset with next/ })).toHaveCount(2);
  await expect.poll(async () => (await db.query("select count(*)::int as n from template_exercises where template_id = $1 and superset_next", [templateId])).rows[0].n).toBe(1);

  // The preview shows A1 / A2.
  await page.goto(`/train/workout/${templateId}`);
  await expect(page.getByText("Superset A1")).toBeVisible();

  // Log it: bench (A1) → row (A2) with no rest in between, rest after the round.
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL("**/workout/**");
  const group = page.getByRole("region", { name: "Superset A" });
  await expect(group.getByText("back to back, rest after each round")).toBeVisible();
  await expect(group.getByRole("region", { name: "Barbell Bench Press" })).toBeVisible();
  await expect(group.getByRole("region", { name: "Barbell Row" })).toBeVisible();
  await expect(group.getByRole("region", { name: "Dip" })).toHaveCount(0);

  await logSet(page, "Barbell Bench Press", 1, 8, 60);
  await expect(page.getByRole("timer")).toHaveCount(0);
  await logSet(page, "Barbell Row", 1, 10, 50);
  await expect(page.getByRole("timer")).toBeVisible();

  // Round two: the round restarts at bench, and the session kept the link.
  await page.getByRole("timer").getByRole("button", { name: "Stop" }).click();
  await logSet(page, "Barbell Bench Press", 2, 8, 60);
  await expect(page.getByRole("timer")).toHaveCount(0);
  const session = page.url().split("/workout/")[1];
  const { rows } = await db.query("select superset_next from session_exercises where session_id = $1 order by position", [session]);
  expect(rows.map((r) => r.superset_next)).toEqual([true, false, false]);
});
