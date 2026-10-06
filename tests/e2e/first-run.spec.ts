import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

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
