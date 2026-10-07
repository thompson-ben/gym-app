import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { E2E_BILLING } from "../../playwright.config";
import { db, newUser, seedSplit, signIn } from "./helpers";

const stripe = new Stripe("sk_test_unused");
let previousHash: string | null = null;

test.beforeAll(async () => {
  previousHash = (await db.query("select billing_secret_hash from public.app_settings where id")).rows[0].billing_secret_hash;
  await db.query("update public.app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [E2E_BILLING.BILLING_SECRET]);
});
test.afterAll(async () => {
  await db.query("update public.app_settings set billing_secret_hash = $1 where id", [previousHash]);
});

const setTrial = (userId: string, endsInDays: number) =>
  db.query("update public.memberships set status = 'trial', trial_ends_at = now() + make_interval(secs => $2) where user_id = $1", [userId, endsInDays * 86400]);

async function webhook(request: import("@playwright/test").APIRequestContext, event: object, secret = E2E_BILLING.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
}

test("trial countdown, trial ended → upgrade, and a Stripe subscription turns membership on", async ({ page }) => {
  const user = await newUser("payer");
  await seedSplit(user, "PPL", "Push", ["dip"]);
  await setTrial(user.id, 2.5);

  await signIn(page, user);
  await expect(page.getByRole("link", { name: /3 days left of your free trial/ })).toBeVisible();
  await page.getByRole("link", { name: /days left of your free trial/ }).click();
  await page.waitForURL("**/upgrade");
  await expect(page.getByRole("radio", { name: /Yearly.*Save 37%.*£2\.50 a month/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Monthly.*£3\.99 \/ month/ })).toBeVisible();

  // The trial ends: history stays, starting a workout offers the plans instead.
  await setTrial(user.id, -0.01);
  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "Your free trial has ended" })).toBeVisible();
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.waitForURL("**/upgrade?reason=trial_ended");
  await expect(page.getByRole("heading", { level: 1, name: "Keep training with NotchLift" })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // A forged webhook is rejected; a signed one from Stripe applies.
  const customer = `cus_e2e_${user.id.slice(0, 8)}`;
  await db.query("update public.memberships set stripe_customer_id = $2 where user_id = $1", [user.id, customer]);
  const now = Math.floor(Date.now() / 1000);
  const event = {
    id: "evt_e2e_1",
    object: "event",
    type: "customer.subscription.created",
    created: now,
    data: {
      object: {
        id: "sub_e2e_1",
        object: "subscription",
        customer,
        status: "active",
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { user_id: user.id },
        items: { object: "list", data: [{ id: "si_1", current_period_end: now + 365 * 86400, price: { id: "price_1", lookup_key: "notchlift_yearly" } }] },
      },
    },
  };
  expect((await webhook(page.request, event, "whsec_wrong")).status()).toBe(400);
  expect((await webhook(page.request, event)).status()).toBe(200);
  // The first payment is recorded once, even if Stripe sends it twice.
  const invoice = { id: "evt_e2e_2", object: "event", type: "invoice.paid", created: now, data: { object: { id: `in_e2e_${user.id.slice(0, 8)}`, object: "invoice", customer, amount_paid: 3000, currency: "gbp", created: now, status_transitions: { paid_at: now } } } };
  expect((await webhook(page.request, invoice)).status()).toBe(200);
  expect((await webhook(page.request, invoice)).status()).toBe(200);
  expect((await db.query("select count(*)::int as n, sum(amount_pence)::int as p from public.payments where user_id = $1", [user.id])).rows[0]).toEqual({ n: 1, p: 3000 });

  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "Your free trial has ended" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.waitForURL("**/workout/**");
  await page.goto("/profile");
  await expect(page.getByText(/Yearly plan, £30\/year\. Renews/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage subscription" })).toBeVisible();
});

test("admins give friends free access; the reminder job needs its secret", async ({ page }) => {
  const admin = await newUser("free-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  const friend = await newUser("free-friend");
  await setTrial(friend.id, 1);

  await signIn(page, admin);
  await page.goto("/admin");
  await page.getByLabel("Email address").fill(friend.email);
  await page.getByLabel("Note (optional)").fill("Gym buddy");
  await page.getByRole("button", { name: "Give free access" }).click();
  await expect(page.getByRole("status").filter({ hasText: "now has free access" })).toBeVisible();
  expect((await db.query("select status from public.memberships where user_id = $1", [friend.id])).rows[0].status).toBe("founder");

  const invitee = `invitee-${Date.now()}@example.com`;
  await page.getByLabel("Email address").fill(invitee);
  await page.getByRole("button", { name: "Give free access" }).click();
  await expect(page.getByRole("status").filter({ hasText: "will get free access when they sign up" })).toBeVisible();
  const pending = page.getByRole("listitem").filter({ hasText: invitee });
  await expect(pending).toBeVisible();
  await page.getByRole("button", { name: `Cancel invite for ${invitee}` }).click();
  await expect(pending).toHaveCount(0);

  expect((await page.request.post("/api/cron/trial-reminders")).status()).toBe(401);
  expect((await page.request.post("/api/cron/trial-reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});
