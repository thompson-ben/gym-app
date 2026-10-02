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
  await expect(page.getByRole("link", { name: /Active split Split B/ })).toBeVisible();
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
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.clock.fastForward(75_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("timer")).toContainText(/0:4[45]/);
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

test("a past workout is recorded on the date it was performed", async ({ page }) => {
  const user = await newUser("past");
  await seedSplit(user, "Past split", "Chest & back", ["incline-barbell-bench-press"]);
  await signIn(page, user);

  const day = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: "Log past workout" }).click();
  await page.getByLabel("Date and time performed").fill(`${day}T18:00`);
  await page.getByRole("button", { name: "Start logging" }).click();
  await page.waitForURL("**/workout/**");
  const sessionId = page.url().split("/workout/")[1];
  await expect(page.getByText("Logging a past workout.")).toBeVisible();

  await logSet(page, INCLINE, 1, 8, 70);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByText(/^Saved for /)).toBeVisible();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await page.waitForURL("**/sessions/**");
  await expect(page.getByText("Workout saved")).toBeVisible();
  await expect(page.getByText(/working sets? · logged afterwards · saved for /)).toBeVisible();

  const { rows } = await db.query("select completed_at, is_backdated from workout_sessions where id = $1", [sessionId]);
  expect(rows[0].is_backdated).toBe(true);
  expect(Date.now() - rows[0].completed_at.getTime()).toBeGreaterThan(2 * 86_400_000);
  const localDay = await page.evaluate((iso) => new Date(iso).toLocaleDateString("en-CA"), rows[0].completed_at.toISOString());
  expect(localDay).toBe(day);

  // Future dates are refused in the picker.
  await page.goto("/train");
  await page.getByRole("button", { name: "Log past workout" }).click();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Date and time performed").fill(`${tomorrow}T18:00`);
  await page.getByRole("button", { name: "Start logging" }).click();
  await expect(page.getByText("The date cannot be in the future.")).toBeVisible();
});

test("a split's start date can be moved back so earlier workouts count towards it", async ({ page }) => {
  const user = await newUser("split-start");
  const { splitId, templateId } = await seedSplit(user, "Backdated split", "Legs", ["back-squat"]);
  const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const doc = await user.client.rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: templateId, p_performed_at: past }).throwOnError();
  await signIn(page, user);
  await expect(page.getByText("0 workouts")).toBeVisible();

  // Resume the past workout from Train, log a set and finish it through the app.
  await page.getByText("Workout in progress", { exact: true }).click();
  await page.waitForURL(`**/workout/${doc.data.id}`);
  await logSet(page, "Barbell Back Squat", 1, 5, 100);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await page.waitForURL("**/sessions/**");

  await page.goto("/train");
  // Date management lives on the split page, one tap from Train's split summary.
  await page.getByRole("link", { name: /Active split/ }).click();
  await page.waitForURL(`**/splits/${splitId}`);
  await page.getByRole("button", { name: "Change start date" }).click();
  const day = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Split started").fill(`${day}T08:00`);
  await page.getByRole("button", { name: "Save start date" }).click();
  await expect(page.getByRole("button", { name: "Save start date" })).toBeHidden();
  await expect(page.getByText("Active for 10 days")).toBeVisible();

  await page.getByRole("link", { name: "Train" }).click();
  await page.waitForURL("**/train");
  await expect(page.getByRole("link", { name: /Active split/ })).toContainText("1 workout completed");
  const { rows } = await db.query("select started_at from split_active_periods where split_id = $1", [splitId]);
  expect(await page.evaluate((iso) => new Date(iso).toLocaleDateString("en-CA"), rows[0].started_at.toISOString())).toBe(day);
});

test("typing set 1's weight fills the following sets", async ({ page }) => {
  const user = await newUser("carry");
  await seedSplit(user, "Carry split", "Legs", ["hack-squat"]);
  await signIn(page, user);
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/workout/**");
  const weight = (n: number) => page.getByLabel(`Hack Squat, set ${n} weight in kg`);
  await weight(1).fill("50");
  await expect(weight(2)).toHaveValue("50");
  await weight(2).fill("45");
  await weight(1).fill("55");
  await expect(weight(2)).toHaveValue("45");
  await weight(1).blur();
  await page.getByRole("button", { name: "Add set" }).click();
  await expect(weight(3)).toHaveValue("45");
});

test("progress compares sets across rep ranges with an estimated 1RM, plus volume and heaviest", async ({ page }) => {
  const user = await newUser("metrics");
  const { templateId } = await seedSplit(user, "Arms", "Arms", ["ez-bar-curl"]);
  const log = async (daysAgo: number, sets: [number, number][]) => {
    const { data: doc } = await user.client
      .rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: templateId, p_performed_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() })
      .throwOnError();
    const payload = {
      notes: null,
      exercises: doc.exercises.map((ex: { id: string }, i: number) => ({
        ...ex,
        position: i,
        sets: sets.map(([w, r], j) => ({ id: crypto.randomUUID(), position: j, set_type: "working", weight_kg: w, reps: r, completed_at: new Date().toISOString() })),
      })),
    };
    const { data: synced } = await user.client.rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: payload }).throwOnError();
    await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
  };
  await log(7, [[30, 12], [30, 12]]);
  await log(1, [[40, 8], [35, 10]]);

  await signIn(page, user);
  await page.goto("/progress");
  await page.getByRole("link", { name: /EZ-Bar Curl/ }).first().click();
  await expect(page.getByRole("heading", { name: "Estimated 1RM per session" })).toBeVisible();
  await expect(page.getByText("40 kg × 8").first()).toBeVisible();
  await expect(page.getByText("≈ 50.7 kg est. 1RM").first()).toBeVisible();
  await page.getByRole("link", { name: "Volume" }).click();
  await expect(page.getByRole("heading", { name: "Session volume" })).toBeVisible();
  await page.getByRole("link", { name: "Heaviest" }).click();
  await expect(page.getByRole("heading", { name: "Heaviest working set per session" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a quick workout takes exercises picked on the spot and lands in history without a split", async ({ page }) => {
  const user = await newUser("quick");
  await seedSplit(user, "Main split", "Push", ["dip"]);
  await signIn(page, user);

  await page.getByRole("button", { name: /Quick workout/ }).click();
  await page.getByLabel("Name (optional)").fill("Hybrid");
  await page.getByRole("button", { name: "Start and choose exercises" }).click();
  await page.waitForURL("**/workout/**");

  // The picker opens straight away; tick several exercises, then add them together.
  await expect(page.getByRole("heading", { name: "Choose exercises" })).toBeVisible();
  for (const name of ["Incline Barbell Bench Press", "Lat Pulldown", "EZ-Bar Curl", "Triceps Pushdown"]) {
    await page.getByLabel("Search exercises").fill(name);
    await page.getByRole("button", { name: new RegExp(`^${name.replace(/[-]/g, "\\-")}`) }).first().click();
  }
  await page.getByRole("button", { name: "Add 4 exercises" }).click();
  await expect(page.getByRole("heading", { name: "Hybrid" })).toBeVisible();
  await expect(page.getByRole("region")).toHaveCount(4);

  await logSet(page, "Lat Pulldown", 1, 12, 70);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await page.waitForURL("**/sessions/**");

  await page.goto("/progress");
  await expect(page.getByRole("link", { name: /Hybrid/ })).toBeVisible();
  await page.goto("/train");
  await expect(page.getByText("0 workouts")).toBeVisible(); // not counted towards the split
});
