import { expect, test } from "@playwright/test";
import { db, expectNoHorizontalScroll, logSet, newUser, seedSplit, signIn } from "./helpers";

const INCLINE = "Incline Barbell Bench Press";

test.afterAll(async () => {
  await db.end();
});

test("A/F: history follows the exercise across splits; prefilled sets are never recorded", async ({ page }) => {
  const user = await newUser("across");
  await seedSplit(user, "Split A", "Push", ["incline-barbell-bench-press", "lat-pulldown"]);
  await signIn(page, user);

  // New exercise: helpful empty state, no invented previous values.
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  await expect(page.getByText("First time logging this exercise").first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Finishing with nothing confirmed offers to continue or discard (scenario F).
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "No sets confirmed yet" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await logSet(page, INCLINE, 1, 9, 72.5);
  await logSet(page, INCLINE, 2, 6, 72.5);
  // Lat pulldown gets a typed weight but is never confirmed.
  const pulldownWeight = page.getByRole("group", { name: "Lat Pulldown, set 1" }).getByLabel(/weight in kg/);
  await pulldownWeight.fill("70");
  // The finish bar is hidden while typing (so the keyboard never covers inputs); dismiss it.
  await expect(page.getByRole("button", { name: "Finish workout" })).toBeHidden();
  await pulldownWeight.blur();
  await expect(page.getByText("2 / 4 sets")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByText("Unconfirmed sets (2) will not be saved")).toBeVisible();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await page.waitForURL("**/sessions/**");
  await expect(page.getByText("Workout saved")).toBeVisible();

  const { rows } = await db.query(
    `select se.exercise_name, ss.weight_kg::float as w, ss.reps from session_sets ss
     join session_exercises se on se.id = ss.session_exercise_id where ss.user_id = $1 order by se.position, ss.position`,
    [user.id],
  );
  expect(rows).toEqual([
    { exercise_name: INCLINE, w: 72.5, reps: 9 },
    { exercise_name: INCLINE, w: 72.5, reps: 6 },
  ]);

  // Split B contains the same exercise: its previous performance appears immediately.
  await seedSplit(user, "Split B", "Full Body A", ["back-squat", "incline-barbell-bench-press"]);
  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "Split B" })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  const card = page.getByRole("region", { name: INCLINE });
  await expect(card.getByText(/Last: .* · Push/)).toBeVisible();
  await expect(card.getByRole("group", { name: `${INCLINE}, set 1` }).getByText("72.5 × 9")).toBeVisible();
  await expect(card.getByRole("group", { name: `${INCLINE}, set 2` }).getByText("72.5 × 6")).toBeVisible();
  // Weight prefilled from the matching previous set, reps left empty with a placeholder.
  const reps = card.getByLabel(`${INCLINE}, set 1 reps`);
  await expect(card.getByLabel(`${INCLINE}, set 1 weight in kg`)).toHaveValue("72.5");
  await expect(reps).toHaveValue("");
  await expect(reps).toHaveAttribute("placeholder", "9");
});

test("E: offline edits survive a reload and sync exactly once", async ({ page, context, browserName }) => {
  const user = await newUser("offline");
  await seedSplit(user, "Offline split", "Chest & back", ["incline-barbell-bench-press"]);
  await signIn(page, user);
  // Wait until the service worker controls the page (it caches the offline shell).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  const sessionId = page.url().split("/workout/")[1];
  await logSet(page, INCLINE, 1, 9, 72.5);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

  await context.setOffline(true);
  await logSet(page, INCLINE, 2, 6, 72.5);
  await expect(page.getByText("Offline · on this device")).toBeVisible();

  if (browserName === "chromium") {
    // Reload without a connection: the offline shell restores the session from this device.
    // (Playwright's WebKit cannot reload through a service worker while emulating offline.)
    await page.reload();
    await expect(page.getByRole("heading", { name: "Chest & back" })).toBeVisible();
    const row2 = page.getByRole("group", { name: `${INCLINE}, set 2` });
    await expect(row2.getByRole("button", { name: /completed/ })).toBeVisible();
    await expect(page.getByText("Offline · on this device")).toBeVisible();
  }

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });

  const { rows } = await db.query(
    `select ss.reps from session_sets ss join session_exercises se on se.id = ss.session_exercise_id
     where se.session_id = $1 and ss.completed_at is not null order by ss.position`,
    [sessionId],
  );
  expect(rows.map((r) => r.reps)).toEqual([9, 6]);
});

test("I: the rest timer reflects real elapsed time after the app was in the background", async ({ page }) => {
  const user = await newUser("timer");
  await seedSplit(user, "Timer split", "Legs", ["back-squat"]);
  await page.clock.install();
  await signIn(page, user);
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  await page.getByRole("button", { name: /Start rest timer, 120 seconds/ }).click();
  await expect(page.getByRole("timer")).toContainText("2:00");

  // Jump 75 s ahead without running interval ticks, as when a phone suspends the page.
  await page.clock.pauseAt(Date.now());
  await page.clock.fastForward(75_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("timer")).toContainText("0:45");
});

test("B/H: a share link shows only the snapshot and can be copied; revoking stops access", async ({ page, browser }) => {
  const owner = await newUser("sharer");
  const { splitId } = await seedSplit(owner, "Owner PPL", "Pull", ["lat-pulldown"], false);
  const { data: share } = await owner.client
    .rpc("upsert_split_share", { p_split_id: splitId, p_name: "Owner PPL", p_description: "Pull focus", p_include_notes: false })
    .throwOnError();

  // Signed out: the snapshot is visible, nothing else.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`/s/${share.token}`);
  await expect(anonPage.getByRole("heading", { name: "Owner PPL" })).toBeVisible();
  await expect(anonPage.getByText("Lat Pulldown")).toBeVisible();
  await expect(anonPage.getByRole("link", { name: "Sign in to copy" })).toBeVisible();
  await expectNoHorizontalScroll(anonPage);
  await anon.close();

  const friend = await newUser("friend");
  await signIn(page, friend);
  await page.goto(`/s/${share.token}`);
  await page.getByRole("button", { name: "Copy split" }).click();
  await page.waitForURL(/\/splits\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Owner PPL" })).toBeVisible();
  await expect(page.getByText("Not active")).toBeVisible();

  await owner.client.rpc("revoke_split_share", { p_share_id: share.id }).throwOnError();
  await page.goto(`/s/${share.token}`);
  await expect(page.getByRole("heading", { name: "This link is not available" })).toBeVisible();
  await page.goto("/splits");
  await expect(page.getByText("Owner PPL")).toBeVisible();
});

test("layout: key screens fit a 320px phone without horizontal scrolling", async ({ page }) => {
  const user = await newUser("narrow");
  await seedSplit(user, "Narrow split", "Chest & back", ["incline-barbell-bench-press", "dip", "push-up"]);
  await page.setViewportSize({ width: 320, height: 640 });
  await signIn(page, user);
  for (const path of ["/train", "/splits", "/progress", "/profile"]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
  await page.goto("/train");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  await expectNoHorizontalScroll(page);
  // Done buttons are large touch targets.
  const box = await page.getByRole("button", { name: /Confirm Dip, set 1/ }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // Added weight is labelled as such; reps-only exercises have no weight input.
  await expect(page.getByLabel("Dip, set 1 added weight in kg")).toBeVisible();
  await expect(page.getByLabel(/Push-Up, set 1 weight/)).toHaveCount(0);
});
