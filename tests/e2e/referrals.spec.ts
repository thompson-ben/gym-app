import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

test("trial members get an invite link; a friend who arrives through it is credited to them", async ({ page, browser }) => {
  const ben = await newUser("ref-ben");
  await db.query("update public.memberships set status = 'trial', trial_ends_at = now() + interval '10 days', free_access = false where user_id = $1", [ben.id]);
  await signIn(page, ben);

  // The nudge under the trial banner leads to the invite card on Profile.
  await page.getByRole("link", { name: /Invite a training partner/ }).click();
  await page.waitForURL("**/profile#invite");
  await expect(page.getByText("Get 14 more days free")).toBeVisible();
  const link = await page.getByLabel("Your invite link").textContent();
  const code = link!.match(/\?ref=([A-Z2-9]{8})$/)![1];

  // A friend opens the link in their own browser, then creates an account there.
  const friendContext = await browser.newContext({ ...test.info().project.use });
  const friendPage = await friendContext.newPage();
  await friendPage.goto(`/?ref=${code}`);
  await expect(friendPage.getByRole("heading", { level: 1 })).toBeVisible();
  const sam = await newUser("ref-sam");
  await signIn(friendPage, sam);
  await expect
    .poll(async () => (await db.query("select referrer_id, via from public.referrals where referred_id = $1", [sam.id])).rows)
    .toEqual([{ referrer_id: ben.id, via: "link" }]);
  await friendContext.close();

  await page.reload();
  await expect(page.getByText("1 signed up · 0 started training")).toBeVisible();

  // Once rewarded, the card says so and the nudge goes away.
  await db.query("update public.memberships set referral_reward_at = now() where user_id = $1", [ben.id]);
  await page.reload();
  await expect(page.getByText("You earned 14 extra days")).toBeVisible();
  await page.goto("/train");
  await expect(page.getByRole("link", { name: /Invite a training partner/ })).toHaveCount(0);
});
