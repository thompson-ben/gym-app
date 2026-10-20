import { expect, test } from "@playwright/test";
import { db, emailLink, logSet, newUser, signIn, uniqueEmail } from "./helpers";

test("the ad page leads to a demo workout that logs with no account and survives a refresh", async ({ page }) => {
  await page.goto("/add-weight?utm_source=facebook&utm_medium=paid&utm_campaign=demo-e2e&utm_content=hero-image");
  await expect(page.getByRole("heading", { level: 1, name: "The workout tracker that tells you when to add weight." })).toBeVisible();
  await page.getByRole("link", { name: "Try a workout now" }).first().click();
  await page.waitForURL("**/try");
  await expect(page.getByRole("heading", { level: 1, name: "Full Body A" })).toBeVisible();
  await expect(page.getByText("0 / 9 sets")).toBeVisible();
  // Example numbers are labelled as such, and bench reached the top of its range last time.
  await expect(page.getByText(/Last time \(example\)/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Barbell bench press" }).getByText("Ready to go heavier.")).toBeVisible();
  await expect(page.getByRole("button", { name: /History/ })).toHaveCount(0);

  // One tap logs a set: reps start at last time's.
  const first = page.getByRole("group", { name: "Back squat, set 1" });
  await first.getByRole("button", { name: /Confirm Back squat, set 1/ }).click();
  await expect(first.getByRole("button", { name: /completed/ })).toBeVisible();
  await expect(page.getByText("1 / 9 sets")).toBeVisible();
  await logSet(page, "Back squat", 2, 9, 82.5);
  await expect(page.getByText("2 / 9 sets")).toBeVisible();
  await expect(page.getByText("Like it? Keep going for real.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 / 9 sets")).toBeVisible();

  // Anonymous events, no account.
  await expect.poll(async () => (await db.query("select count(*)::int as n from analytics_events where name in ('demo_start', 'demo_set') and created_at > now() - interval '1 minute'")).rows[0].n).toBeGreaterThanOrEqual(2);
  await page.getByRole("link", { name: /Start free/ }).last().click();
  await page.waitForURL("**/sign-in?mode=sign-up");
  expect((await page.context().cookies()).find((c) => c.name === "nl_demo")?.value).toBe("full-body");
});

test("an account from the demo, confirmed in another browser, starts with the demo's split", async ({ page, browser }) => {
  await page.goto("/try");
  await page.getByRole("link", { name: /Start free/ }).last().click();
  const email = uniqueEmail("demo-signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // The confirmation link opens in the phone's normal browser (no demo cookie there).
  const link = await emailLink(email, /Confirm your NotchLift account/);
  const other = await browser.newContext();
  const phone = await other.newPage();
  await phone.goto(link);
  await phone.waitForURL("**/train");
  const card = phone.getByRole("region", { name: "Full Body (3 days)" });
  await expect(card.getByText("From your demo")).toBeVisible();
  await card.getByRole("button", { name: "Use this split" }).click();
  await expect(phone.getByRole("link", { name: /Active split Full Body \(3 days\)/ })).toBeVisible();
  await expect(phone.getByRole("heading", { level: 1, name: "Full Body A" })).toBeVisible();
  const { rows } = await db.query("select raw_user_meta_data ->> 'via' as via from auth.users where email = $1", [email]);
  expect(rows[0].via).toBe("demo");
  await other.close();
});

test("people who didn't come from the demo see the usual first run, and signed-in people skip the demo", async ({ page }) => {
  const user = await newUser("not-demo");
  await signIn(page, user);
  await expect(page.getByRole("heading", { name: "Welcome to NotchLift" })).toBeVisible();
  await expect(page.getByText("From your demo")).toHaveCount(0);
  await page.goto("/try");
  await page.waitForURL("**/train");
});
