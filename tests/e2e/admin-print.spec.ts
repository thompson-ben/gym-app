import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

test.afterAll(async () => {
  await db.end();
});

test("admin can save the dashboard as a PDF that leaves out navigation, forms and email addresses", async ({ page }) => {
  const admin = await newUser("print-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  const payer = await newUser("print-payer");
  await db.query("insert into public.payments (user_id, stripe_invoice_id, amount_pence, currency, plan, paid_at) values ($1, $2, 3000, 'gbp', 'yearly', now())", [payer.id, `in_print_${Date.now()}`]);

  await signIn(page, admin);
  await page.goto("/admin?days=7");
  const refunds = page.getByRole("region", { name: "Refund window" });
  await expect(refunds.getByText(payer.email, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  await expect(page.getByText(/^NotchLift · Last 7 days · generated/)).toBeHidden();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByText(/^NotchLift · Last 7 days · generated/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
  await expect(refunds.getByText("£30", { exact: true }).first()).toBeVisible();
  for (const hidden of [
    page.getByRole("button", { name: "Save as PDF" }),
    page.getByRole("navigation", { name: "Main" }),
    page.getByRole("navigation", { name: "Date range" }),
    page.getByRole("form", { name: "Add ad spend" }),
    refunds.getByText(payer.email, { exact: false }),
    refunds.getByRole("button", { name: "Mark refunded" }),
    page.getByRole("region", { name: "Free access for friends" }),
  ]) {
    await expect(hidden.first()).toBeHidden();
  }
  // Print colours are light, whatever the device theme.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");

  if (process.env.ADMIN_PDF_OUT) await page.pdf({ path: process.env.ADMIN_PDF_OUT, format: "A4", printBackground: true });
});
