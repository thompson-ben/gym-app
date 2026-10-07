import { expect, test } from "@playwright/test";
import { logSet, newUser, seedSplit, signIn } from "./helpers";

test("an extra set added by mistake can be removed in one tap; confirmed sets cannot", async ({ page }) => {
  const user = await newUser("remove-set");
  await seedSplit(user, "Push", "Chest", ["dip"]);
  await signIn(page, user);
  await page.getByRole("button", { name: "Start Chest" }).click();
  await page.waitForURL("**/workout/**");
  const card = page.getByRole("region", { name: "Dip" });
  const sets = card.getByRole("group", { name: /^Dip, set \d/ });
  const planned = 2; // seedSplit plans 2 working sets
  await expect(sets).toHaveCount(planned);
  // Planned sets have no one-tap remove; only an extra set does.
  await expect(card.getByRole("button", { name: "Remove the last set of Dip" })).toHaveCount(0);

  await logSet(page, "Dip", 1, 10);
  await card.getByRole("button", { name: "Add set" }).click();
  await expect(sets).toHaveCount(planned + 1);
  await card.getByRole("button", { name: "Remove the last set of Dip" }).click();
  await expect(sets).toHaveCount(planned);

  // Once every set is confirmed, the one-tap remove disappears (use the set's own menu instead).
  for (let n = 2; n <= planned; n++) await logSet(page, "Dip", n, 8);
  await expect(card.getByRole("button", { name: "Remove the last set of Dip" })).toHaveCount(0);
});
