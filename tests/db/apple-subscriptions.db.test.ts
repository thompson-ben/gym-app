import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, deleteUsers, pool } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";
let previousHash: string | null = null;

beforeAll(async () => {
  previousHash = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
  await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
});

afterAll(async () => {
  await pool.query("update app_settings set billing_secret_hash = $1 where id", [previousHash]);
  await pool.query("delete from payments where apple_transaction_id like 'apple-test-%'");
  await deleteUsers(users);
  await pool.end();
});

const member = async (uid: string) =>
  (await pool.query("select status, billing_source, plan, cancel_at_period_end, billing_issue from memberships where user_id = $1", [uid])).rows[0];
const apply = (uid: string, active: boolean, opts: { plan?: string; willRenew?: boolean; issue?: boolean } = {}) =>
  pool.query("select apple_apply_subscription($1, $2, $3, $4, now() + interval '30 days', $5, $6) as r", [SECRET, uid, active, opts.plan ?? "monthly", opts.willRenew ?? true, opts.issue ?? false]).then((r) => r.rows[0].r);

describe("App Store subscriptions (migration 37)", () => {
  it("makes a trial member paid through Apple, and lapses them when it ends", async () => {
    const uid = await createUser("as-buyer");
    users.push(uid);
    await pool.query("update memberships set status = 'trial', free_access = false, trial_ends_at = now() + interval '5 days' where user_id = $1", [uid]);

    await expect(pool.query("select apple_apply_subscription('wrong', $1, true, 'monthly', now(), true, false)", [uid])).rejects.toThrow();
    expect(await apply(uid, true, { plan: "yearly", willRenew: false, issue: true })).toBe("paid");
    expect(await member(uid)).toMatchObject({ status: "paid", billing_source: "apple", plan: "yearly", cancel_at_period_end: true, billing_issue: true });
    expect(await apply(uid, false)).toBe("lapsed");
    expect(await member(uid)).toMatchObject({ status: "lapsed", cancel_at_period_end: false, billing_issue: false });
  });

  it("never lapses a website member, and Stripe never lapses an App Store member", async () => {
    const web = await createUser("as-web");
    const app = await createUser("as-app");
    users.push(web, app);
    await pool.query("update memberships set status = 'paid', free_access = false, billing_source = 'stripe', stripe_customer_id = $2 where user_id = $1", [web, `cus_test_${web.slice(0, 8)}`]);
    expect(await apply(web, false)).toBe("unchanged");
    expect((await member(web)).status).toBe("paid");

    await pool.query("update memberships set status = 'trial', free_access = false, trial_ends_at = now() + interval '5 days' where user_id = $1", [app]);
    await apply(app, true);
    const r = await pool.query("select billing_apply_subscription($1, $2, null, 'sub_old', 'canceled', 'monthly', now(), false, now()) as r", [SECRET, app]);
    expect(r.rows[0].r).toBe("unchanged");
    expect(await member(app)).toMatchObject({ status: "paid", billing_source: "apple" });
  });

  it("records each App Store payment once and marks refunds", async () => {
    const uid = await createUser("as-pay");
    users.push(uid);
    const tx = `apple-test-${uid.slice(0, 8)}`;
    const record = () => pool.query("select apple_record_payment($1, $2, $3, 399, 'GBP', 'monthly', now())", [SECRET, uid, tx]);
    await record();
    await record();
    const rows = (await pool.query("select amount_pence, currency, stripe_invoice_id, refunded_at from payments where apple_transaction_id = $1", [tx])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount_pence: 399, currency: "gbp", stripe_invoice_id: null, refunded_at: null });
    await pool.query("select apple_mark_refunded($1, $2)", [SECRET, tx]);
    expect((await pool.query("select refunded_at from payments where apple_transaction_id = $1", [tx])).rows[0].refunded_at).not.toBeNull();
    await expect(pool.query("insert into payments (amount_pence, currency, paid_at) values (1, 'gbp', now())")).rejects.toThrow(/payments_one_source/);
  });
});
