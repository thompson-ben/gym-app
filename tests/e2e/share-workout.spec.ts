import { expect, test } from "@playwright/test";
import { db, logSet, newUser, seedSplit, signIn } from "./helpers";

test("a finished workout can be shared as a story-sized image, with last time's best set", async ({ page }) => {
  const user = await newUser("share-workout");
  await seedSplit(user, "Push / Pull / Legs", "Push", ["barbell-bench-press", "dip"]);
  await signIn(page, user);
  // Two sessions, so the second image shows last time's best set too.
  for (const [weight, reps] of [[60, 10], [62.5, 8]]) {
    await page.goto("/train");
    await page.getByRole("button", { name: "Start Push" }).click();
    await page.waitForURL("**/workout/**");
    await logSet(page, "Barbell Bench Press", 1, reps, weight);
    await logSet(page, "Dip", 1, 12);
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Finish workout" }).click();
    await page.getByRole("button", { name: "Finish & save" }).click();
    await page.waitForURL("**/sessions/**");
  }

  // Browsers without file sharing get a download instead of the share sheet.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share workout" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("notchlift-push.png");
  await file.saveAs("/tmp/claude-0/-home-user-gym-app/2af1f745-bdc3-56f7-9755-fbeaf65cca57/scratchpad/preview/share-card.png");
  await expect.poll(async () =>
    (await db.query("select count(*)::int as n from analytics_events where name = 'cta_click' and detail = 'share_workout' and path = '/sessions' and created_at > now() - interval '2 minutes'")).rows[0].n,
  ).toBeGreaterThanOrEqual(1);
});
