import { expect, test } from "@playwright/test";
import { E2E_BILLING } from "../../playwright.config";
import { unsubscribeToken } from "../../src/lib/emails/unsubscribe";
import { db, newUser, signIn } from "./helpers";

let previousHash: string | null = null;
test.beforeAll(async () => {
  previousHash = (await db.query("select billing_secret_hash from public.app_settings where id")).rows[0].billing_secret_hash;
  await db.query("update public.app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [E2E_BILLING.BILLING_SECRET]);
});
test.afterAll(async () => {
  await db.query("update public.app_settings set billing_secret_hash = $1 where id", [previousHash]);
  await db.end();
});

const reminders = async (id: string) => (await db.query("select reminder_emails from public.profiles where id = $1", [id])).rows[0].reminder_emails;

test("the email link asks first, then unsubscribes without signing in; mail apps' one-click works; Profile switches it back", async ({ page }) => {
  const user = await newUser("unsub");
  const token = unsubscribeToken(user.id, E2E_BILLING.BILLING_SECRET);

  // A tampered link is refused.
  await page.goto(`/unsubscribe?u=${user.id}&t=${token.slice(0, -2)}xx`);
  await expect(page.getByRole("heading", { name: "That link didn’t work" })).toBeVisible();

  // Opening the real link changes nothing until the button is pressed.
  await page.goto(`/unsubscribe?u=${user.id}&t=${token}`);
  await expect(page.getByRole("heading", { name: "Stop reminder emails?" })).toBeVisible();
  expect(await reminders(user.id)).toBe(true);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You’re unsubscribed" })).toBeVisible();
  expect(await reminders(user.id)).toBe(false);

  // Back on in Profile.
  await signIn(page, user);
  await page.goto("/profile");
  const toggle = page.getByRole("switch", { name: "Reminder emails" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => reminders(user.id)).toBe(true);

  // One-click unsubscribe as mail apps send it (RFC 8058), and a forged one.
  const oneClick = (t: string) =>
    page.request.post(`/api/unsubscribe?u=${user.id}&t=${t}`, { form: { "List-Unsubscribe": "One-Click" } });
  expect((await oneClick("forged")).status()).toBe(400);
  expect(await reminders(user.id)).toBe(true);
  const res = await oneClick(token);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("unsubscribed");
  expect(await reminders(user.id)).toBe(false);
});
