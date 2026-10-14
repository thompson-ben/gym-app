import { expect, test } from "@playwright/test";
import { db, newUser, signIn } from "./helpers";

test.afterAll(async () => {
  await db.end();
});

test("admin sees yesterday at a glance, adds ad spend to get cost per sign-up, and tracks the refund window", async ({ page }) => {
  const campaign = `e2e-spend-${Date.now()}`;
  const admin = await newUser("money-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);

  // Two sign-ups from one ad today, and a first payment from one of them.
  let payerEmail = "";
  for (const label of ["money-a", "money-b"]) {
    const u = await newUser(label);
    await u.client.rpc("record_attribution", { p_props: { utm_source: "facebook", utm_campaign: campaign, utm_content: "fast-image" } }).throwOnError();
    if (label === "money-a") {
      payerEmail = u.email;
      await db.query("insert into public.payments (user_id, stripe_invoice_id, amount_pence, currency, plan, paid_at) values ($1, $2, 3000, 'gbp', 'yearly', now())", [u.id, `in_${campaign}`]);
    }
  }

  await signIn(page, admin);
  await page.goto("/admin?days=1");
  await expect(page.getByRole("heading", { name: /^Yesterday/ })).toBeVisible();

  // Spend for today on that ad: £10 for 2 sign-ups is £5 each.
  const form = page.getByRole("form", { name: "Add ad spend" });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  await form.getByLabel("From").fill(today);
  await form.getByLabel("To").fill(today);
  await form.getByLabel("Campaign").fill(campaign);
  await form.getByLabel("Ad (optional)").fill("fast-image");
  await form.getByLabel("Amount spent (£)").fill("10");
  await form.getByRole("button", { name: "Add spend" }).click();

  const row = page.getByRole("region", { name: "Cost per result" }).getByRole("row").filter({ hasText: campaign });
  await expect(row).toContainText("£10");
  await expect(row.getByRole("cell").nth(2)).toHaveText("2£5");
  await expect(row.getByRole("cell").nth(4)).toHaveText("1£10");

  // The yearly payment is inside its 14-day window until it's marked refunded.
  const refunds = page.getByRole("region", { name: "Refund window" });
  const item = refunds.getByRole("listitem").filter({ hasText: payerEmail });
  await expect(item).toContainText("£30");
  await item.getByRole("button", { name: "Mark refunded" }).click();
  await expect(item.getByRole("button", { name: "Undo" })).toBeVisible();
  expect((await db.query("select refunded_at from public.payments where stripe_invoice_id = $1", [`in_${campaign}`])).rows[0].refunded_at).not.toBeNull();
});
