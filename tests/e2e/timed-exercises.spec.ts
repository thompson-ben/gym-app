import { expect, test } from "@playwright/test";
import { db, expectNoHorizontalScroll, newUser, seedSplit, signIn } from "./helpers";

const LEVER = "Front Lever";

test.afterAll(async () => {
  await db.end();
});

test("plan a hold in seconds, time it with the hold timer, and see the longest hold", async ({ page }) => {
  const user = await newUser("timed");
  const { splitId, templateId } = await seedSplit(user, "Skill split", "Skill session", ["front-lever"]);
  await user.client.from("template_exercises").update({ target_sets: 2, rep_min: 10, rep_max: 15 }).eq("template_id", templateId).throwOnError();
  await page.clock.install();
  await signIn(page, user);

  // The plan shows seconds, and can be changed in the workout editor.
  await page.goto(`/splits/${splitId}/workouts/${templateId}`);
  await page.getByRole("button", { name: "10–15 s" }).click();
  await page.getByLabel("Maximum seconds").fill("20");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "10–20 s" })).toBeVisible();

  await page.goto(`/train/workout/${templateId}`);
  await expect(page.getByText("2 working sets · 10–20 s")).toBeVisible();
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL("**/workout/**");

  const card = page.getByRole("region", { name: LEVER });
  await expect(card.getByText("Secs", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Set 1 with the timer: a 3-second count-in, then the hold.
  const timer = card.getByRole("timer", { name: `Hold timer for ${LEVER}` });
  await expect(timer.getByText("Hold timer · set 1")).toBeVisible();
  await timer.getByRole("button", { name: /Start the hold timer/ }).click();
  await expect(timer.getByText("Get ready")).toBeVisible();
  await page.clock.fastForward(3_000 + 12_400);
  await expect(timer.getByText(/^Holding/)).toBeVisible();
  await timer.getByRole("button", { name: /Stop the hold/ }).click();
  await expect(card.getByLabel(`${LEVER}, set 1 seconds`)).toHaveValue("12");
  await card.getByRole("button", { name: `Confirm ${LEVER}, set 1` }).click();
  await expect(card.getByRole("group", { name: `${LEVER}, set 1, completed` })).toBeVisible();

  // Set 2 typed in by hand.
  await expect(timer.getByText("Hold timer · set 2")).toBeVisible();
  await card.getByLabel(`${LEVER}, set 2 seconds`).fill("20");
  await card.getByRole("button", { name: `Confirm ${LEVER}, set 2` }).click();
  // Set 1 was below the top of the range, so no "top of your range" yet.
  await expect(card.getByText("Top of your range!")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await page.waitForURL("**/sessions/**");
  await expect(page.getByText("Workout saved")).toBeVisible();
  const summary = page.getByRole("region", { name: LEVER });
  await expect(summary.getByText("2 × 10–20 s")).toBeVisible();
  await expect(summary.getByRole("listitem")).toHaveText([/12 s$/, /20 s$/]);

  const rows = await db.query(
    "select ss.reps, ss.weight_kg from session_sets ss join session_exercises se on se.id = ss.session_exercise_id where se.user_id = $1 order by ss.position",
    [user.id],
  );
  expect(rows.rows).toEqual([{ reps: 12, weight_kg: null }, { reps: 20, weight_kg: null }]);
});
