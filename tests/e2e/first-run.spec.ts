import { expect, test } from "@playwright/test";
import { db, newUser, seedSplit, signIn } from "./helpers";

test("a new account is welcomed, can start from a template and train straight away", async ({ page }) => {
  const user = await newUser("first-run");
  await signIn(page, user);
  await expect(page.getByRole("heading", { name: "Welcome to NotchLift" })).toBeVisible();
  await page.getByRole("button", { name: "Start from a template" }).click();
  await page.getByRole("button", { name: /Full Body \(3 days\)/ }).click();
  await expect(page.getByText("Back squat · Barbell bench press")).toBeVisible();
  await page.getByRole("button", { name: "Use this split" }).click();
  // The new split is active and Train suggests its first workout.
  await expect(page.getByRole("link", { name: /Active split Full Body \(3 days\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Full Body A" })).toBeVisible();
  await expect(page.getByText("First in your split order")).toBeVisible();
});

test("feedback is sent with the screen it came from", async ({ page }) => {
  const user = await newUser("feedback");
  await signIn(page, user);
  await page.goto("/progress");
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("button", { name: /Send feedback/ }).click();
  await page.getByText("Idea", { exact: true }).click();
  await page.getByLabel("Message").fill("Would love a dark-green theme");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Thanks, that’s been sent.")).toBeVisible();
  const { rows } = await db.query("select kind, message, page from feedback where user_id = $1", [user.id]);
  expect(rows).toEqual([{ kind: "idea", message: "Would love a dark-green theme", page: "/progress" }]);
});

test("phone browsers are shown how to add NotchLift to the Home Screen, and can dismiss it", async ({ page }) => {
  const user = await newUser("install");
  await signIn(page, user);
  const card = page.getByRole("button", { name: /Add NotchLift to your Home Screen/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("dialog", { name: "Add to Home Screen" })).toContainText(/Install app|Install NotchLift/);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /Add NotchLift to your Home Screen/ })).toHaveCount(0);
  // Always available later from Profile.
  await page.goto("/profile");
  await page.getByRole("button", { name: /Add to Home Screen/ }).click();
  await expect(page.getByRole("dialog", { name: "Add to Home Screen" })).toBeVisible();
});

test("once a split is ready, Train asks which days they train; Profile can change them", async ({ page }) => {
  const user = await newUser("training-days");
  await seedSplit(user, "Upper / Lower", "Upper A", ["dip"]);
  await signIn(page, user);
  const card = page.getByRole("region", { name: "Which days do you train?" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Pick your days" })).toBeDisabled();
  await card.getByRole("button", { name: "Monday" }).click();
  await card.getByRole("button", { name: "Thursday" }).click();
  await card.getByRole("button", { name: "Save Mon and Thu" }).click();
  await expect(page.getByText("Got it: Mondays and Thursdays.")).toBeVisible();
  expect((await db.query("select training_days from profiles where id = $1", [user.id])).rows[0].training_days).toEqual([1, 4]);
  await page.reload();
  await expect(page.getByRole("region", { name: "Which days do you train?" })).toHaveCount(0);

  await page.goto("/profile");
  const days = page.getByRole("group", { name: "Training days" });
  await expect(days.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
  await days.getByRole("button", { name: "Saturday" }).click();
  await expect(page.getByText("Saved", { exact: true }).last()).toBeVisible();
  await expect.poll(async () => (await db.query("select training_days from profiles where id = $1", [user.id])).rows[0].training_days).toEqual([1, 4, 6]);
});

test("skipping the training-days question doesn't ask again", async ({ page }) => {
  const user = await newUser("training-days-skip");
  await seedSplit(user, "Full Body", "Full Body A", ["dip"]);
  await signIn(page, user);
  const card = page.getByRole("region", { name: "Which days do you train?" });
  await card.getByRole("button", { name: "Skip" }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await db.query("select training_days from profiles where id = $1", [user.id])).rows[0].training_days).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Full Body A" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Which days do you train?" })).toHaveCount(0);
});

test("before a first workout, Train offers to log the last session and to have Ben set the split up", async ({ page }) => {
  const user = await newUser("first-session-help");
  await seedSplit(user, "Upper / Lower", "Upper A", ["dip"]);
  await signIn(page, user);
  const card = page.getByRole("region", { name: "Trained recently?" });
  await expect(card).toBeVisible();
  const help = page.getByRole("link", { name: "Send my programme" });
  await expect(help).toHaveAttribute("href", /^mailto:.+\?subject=Set%20up%20my%20NotchLift%20split&body=/);
  await card.getByRole("button", { name: "Log my last session" }).click();
  // The existing past-workout flow: pick when it was performed.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(async () =>
    (await db.query("select count(*)::int as n from analytics_events where name = 'cta_click' and detail = 'log_last_session' and path = '/train' and created_at > now() - interval '2 minutes'")).rows[0].n,
  ).toBeGreaterThanOrEqual(1);
});

test("a brand-new account can ask Ben to set up its split", async ({ page }) => {
  const user = await newUser("setup-help-welcome");
  await signIn(page, user);
  await expect(page.getByRole("heading", { name: "Welcome to NotchLift" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send my programme" })).toBeVisible();
});
