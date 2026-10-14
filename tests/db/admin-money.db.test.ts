import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
const tag = `spend-${Date.now()}`;

afterAll(async () => {
  await pool.query("delete from ad_spend where campaign = $1", [tag]);
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

async function makeAdmin() {
  const id = await newUser("money-admin");
  await pool.query("insert into admins (user_id) values ($1)", [id]);
  return id;
}

const ukDay = async (offset: number) => (await pool.query("select ((now() at time zone 'Europe/London')::date + $1::int)::text as d", [offset])).rows[0].d as string;

describe("admin money views (migration 21)", () => {
  it("spreads ad spend over its days and sets it against sign-ups, activation and payment by ad", async () => {
    const admin = await makeAdmin();
    const call = (sql: string, params: unknown[] = []) => as(user(admin), (q) => q(sql, params));
    // £14 over the last 7 days for one ad, £3 yesterday for the whole campaign.
    await call("select admin_add_ad_spend($1::date, $2::date, $3, $4, $5)", [await ukDay(-6), await ukDay(0), tag, "fast-image", 1400]);
    await call("select admin_add_ad_spend($1::date, null, $2, '', $3)", [await ukDay(-1), tag, 300]);

    const a = await newUser("spend-a");
    const b = await newUser("spend-b");
    for (const uid of [a, b]) {
      await as(user(uid), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "facebook", utm_campaign: tag, utm_content: "fast-image" })]));
    }
    const split = await createSplit(a, "S");
    const { templateId } = await createTemplate(a, split, "W", [{ exerciseId: await catalogueId("dip") }]);
    await logWorkout(a, templateId, [[{ weight: 0, reps: 8, done: true }]]);
    await pool.query("insert into payments (user_id, stripe_invoice_id, amount_pence, currency, plan, paid_at) values ($1, $2, 399, 'gbp', 'monthly', now())", [a, `in_${tag}`]);

    const week = await call("select admin_ad_spend(7) as r").then((r) => r[0].r);
    const c = week.campaigns.find((x: { campaign: string }) => x.campaign === tag);
    expect(c).toMatchObject({ spend_pence: 1700, signups: 2, activated: 1, paid: 1 });
    expect(c.ads).toEqual([{ content: "fast-image", spend_pence: 1400, visits: 0, signups: 2, activated: 1, paid: 1 }]);

    // Today only gets one day's share of the week entry.
    const today = await call("select admin_ad_spend(1) as r").then((r) => r[0].r);
    expect(today.campaigns.find((x: { campaign: string }) => x.campaign === tag).spend_pence).toBe(200);

    const id = week.entries.find((e: { campaign: string; content: string }) => e.campaign === tag && e.content === "").id;
    await call("select admin_delete_ad_spend($1)", [id]);
    const after = await call("select admin_ad_spend(7) as r").then((r) => r[0].r);
    expect(after.campaigns.find((x: { campaign: string }) => x.campaign === tag).spend_pence).toBe(1400);
  });

  it("lists first payments still inside the 14-day refund window, and refunds can be marked", async () => {
    const admin = await makeAdmin();
    const call = (sql: string, params: unknown[] = []) => as(user(admin), (q) => q(sql, params));
    const fresh = await newUser("refund-fresh");
    const old = await newUser("refund-old");
    const insert = (uid: string, inv: string, ago: string) =>
      pool.query(`insert into payments (user_id, stripe_invoice_id, amount_pence, currency, plan, paid_at) values ($1, $2, 3000, 'gbp', 'yearly', now() - $3::interval) returning id`, [uid, inv, ago]);
    const { rows } = await insert(fresh, `in_${tag}_fresh`, "2 days");
    await insert(old, `in_${tag}_old`, "40 days");
    await insert(old, `in_${tag}_renewal`, "1 day"); // a renewal, not a first payment

    const window = async () => (await call("select admin_refund_window() as r"))[0].r;
    const mine = (w: { payments: { id: number; refunded_at: string | null }[] }) => w.payments.filter((p) => p.id === Number(rows[0].id));
    let w = await window();
    expect(mine(w)).toHaveLength(1);
    expect(w.payments.some((p: { email: string }) => p.email?.includes("refund-old"))).toBe(false);
    const before = w.total_pence;

    await call("select admin_mark_refunded($1, true)", [rows[0].id]);
    w = await window();
    expect(w.total_pence).toBe(before - 3000);
    expect(mine(w)[0].refunded_at).not.toBeNull();
  });

  it("gives a glance at yesterday and what's coming up, and counts rewarded referrers who paid; admins only", async () => {
    const admin = await makeAdmin();
    const g = (await as(user(admin), (q) => q("select admin_glance() as g")))[0].g;
    for (const k of ["visits", "signups", "first_workouts", "payments", "revenue_pence", "trials_ending_3d", "cancelling", "new_comments"]) {
      expect(typeof g[k]).toBe("number");
    }
    const r = (await as(user(admin), (q) => q("select admin_referrals(30) as r")))[0].r;
    expect(r).toHaveProperty("rewarded_paid");
    expect(r).toHaveProperty("rewards_all_time");

    const stranger = await newUser("money-stranger");
    for (const sql of ["select admin_glance()", "select admin_refund_window()", "select admin_ad_spend(7)", "select admin_add_ad_spend(current_date, null, 'x', '', 100)"]) {
      await expect(as(user(stranger), (q) => q(sql))).rejects.toThrow(/not_admin/);
    }
    await expect(as(user(stranger), (q) => q("select * from ad_spend"))).rejects.toThrow();
  });
});
