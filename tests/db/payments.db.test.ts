import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, finish, logWorkout, pool, startSession, sync, user, withSets } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";
let previousHash: string | null = null;
let dip: string;

beforeAll(async () => {
  dip = await catalogueId("dip");
  previousHash = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
  await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
});

afterAll(async () => {
  await pool.query("update app_settings set billing_secret_hash = $1 where id", [previousHash]);
  await pool.query("delete from payments where stripe_invoice_id like 'in_test_%'");
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

const setMembership = (uid: string, status: string, trialEnds: string | null = null) =>
  pool.query("update memberships set status = $2, trial_ends_at = $3 where user_id = $1", [uid, status, trialEnds]);

async function workout(uid: string) {
  const split = await createSplit(uid, "S");
  return (await createTemplate(uid, split, "W", [{ exerciseId: dip }])).templateId;
}

const apply = (args: { user?: string | null; customer?: string | null; status: string; plan?: string; at?: string; cancel?: boolean; secret?: string }) =>
  as(anon, async (q) =>
    (
      await q("select billing_apply_subscription($1, $2, $3, 'sub_test', $4, $5, now() + interval '30 days', $6, $7) as r", [
        args.secret ?? SECRET,
        args.user ?? null,
        args.customer ?? null,
        args.status,
        args.plan ?? "monthly",
        args.cancel ?? false,
        args.at ?? new Date().toISOString(),
      ])
    )[0].r,
  );

const member = async (uid: string) => (await pool.query("select * from memberships where user_id = $1", [uid])).rows[0];

describe("payments (migration 14)", () => {
  it("lets founders, paying members and active trials start workouts; pauses expired trials and lapsed members", async () => {
    const me = await newUser("gate");
    const tpl = await workout(me);
    const canStart = async () => as(user(me), async (q) => (await q("select can_start_workout() as c"))[0].c);

    expect(await canStart()).toBe(true); // founder (auto_founder is on)
    await setMembership(me, "trial", new Date(Date.now() + 86_400_000).toISOString());
    expect(await canStart()).toBe(true);
    const open = await startSession(me, tpl);

    // The trial ends mid-workout: that workout can still be saved and finished.
    await setMembership(me, "trial", new Date(Date.now() - 1000).toISOString());
    expect(await canStart()).toBe(false);
    const res = await sync(me, withSets(open, [[{ weight: 10, reps: 8, done: true }]]), open.revision);
    await finish(me, open.id, res.revision);

    // But no new workout of any kind: from a template, a quick workout, or logged afterwards.
    await expect(startSession(me, tpl)).rejects.toThrow(/membership_required/);
    await expect(as(user(me), (q) => q("select start_quick_session($1)", [randomUUID()]))).rejects.toThrow(/membership_required/);
    // History is still readable.
    expect(await as(user(me), (q) => q("select id from workout_sessions where status = 'completed'"))).toHaveLength(1);

    await setMembership(me, "lapsed");
    await expect(startSession(me, tpl)).rejects.toThrow(/membership_required/);
    await setMembership(me, "paid");
    await expect(startSession(me, tpl)).resolves.toBeTruthy();
  });

  it("billing functions require the billing secret", async () => {
    const me = await newUser("secret");
    await expect(as(anon, (q) => q("select billing_link_customer('wrong-secret-wrong-secret-wrong-secret', $1, 'cus_x')", [me]))).rejects.toThrow(/billing_forbidden/);
    await expect(apply({ user: me, status: "active", secret: "" })).rejects.toThrow(/billing_forbidden/);
    await expect(as(anon, (q) => q("select * from trial_reminders_due('nope')"))).rejects.toThrow(/billing_forbidden/);
    // Users cannot write their own membership or read payments.
    await expect(as(user(me), (q) => q("update memberships set status = 'paid' where user_id = $1", [me]))).rejects.toThrow();
    await expect(as(user(me), (q) => q("select * from payments"))).rejects.toThrow();
  });

  it("follows the subscription through Stripe's states, ignoring stale events and never demoting founders", async () => {
    const me = await newUser("subscriber");
    const customer = `cus_test_${me.slice(0, 8)}`;
    await setMembership(me, "trial", new Date(Date.now() + 86_400_000).toISOString());
    await as(anon, (q) => q("select billing_link_customer($1, $2, $3)", [SECRET, me, customer]));

    expect(await apply({ user: me, customer, status: "active", plan: "yearly", at: "2026-10-07T10:00:00Z" })).toBe("paid");
    expect(await member(me)).toMatchObject({ status: "paid", plan: "yearly", stripe_customer_id: customer, billing_issue: false });

    // Found by customer id alone; a failed renewal keeps access but flags it.
    expect(await apply({ customer, status: "past_due", plan: "yearly", at: "2026-10-07T11:00:00Z" })).toBe("paid");
    expect((await member(me)).billing_issue).toBe(true);
    // An older event arriving late changes nothing.
    expect(await apply({ customer, status: "canceled", at: "2026-10-07T09:00:00Z" })).toBe("stale");
    expect((await member(me)).status).toBe("paid");
    // Cancelled at period end: still paid until it ends.
    await apply({ customer, status: "active", plan: "yearly", cancel: true, at: "2026-10-07T12:00:00Z" });
    expect(await member(me)).toMatchObject({ status: "paid", cancel_at_period_end: true, billing_issue: false });
    expect(await apply({ customer, status: "canceled", at: "2026-10-07T13:00:00Z" })).toBe("lapsed");
    expect((await member(me)).status).toBe("lapsed");

    const founder = await newUser("founder-payer");
    expect(await apply({ user: founder, status: "canceled" })).toBe("lapsed");
    expect((await member(founder)).status).toBe("founder");

    await expect(apply({ customer: "cus_nobody", status: "active" })).rejects.toThrow(/billing_user_not_found/);
  });

  it("records payments once and shows revenue on the admin dashboard", async () => {
    const admin = await newUser("billing-admin");
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const payer = await newUser("payer");
    const customer = `cus_test_${payer.slice(0, 8)}`;
    await setMembership(payer, "trial", new Date(Date.now() + 86_400_000).toISOString());
    await as(anon, (q) => q("select billing_link_customer($1, $2, $3)", [SECRET, payer, customer]));
    await apply({ user: payer, customer, status: "active", plan: "yearly" });
    const pay = () =>
      as(anon, (q) => q("select billing_record_payment($1, $2, 'in_test_1', 3000, 'GBP', null, now())", [SECRET, customer]));
    await pay();
    await pay();
    expect((await pool.query("select count(*)::int as n, min(user_id::text) as u from payments where stripe_invoice_id = 'in_test_1'")).rows[0]).toEqual({ n: 1, u: payer });

    const o = await as(user(admin), async (q) => (await q("select admin_overview(30) as o"))[0].o);
    expect(o.billing.paying).toBeGreaterThanOrEqual(1);
    expect(o.billing.yearly).toBeGreaterThanOrEqual(1);
    expect(o.billing.revenue_pence).toBeGreaterThanOrEqual(3000);
    expect(o.billing.mrr_pence).toBeGreaterThanOrEqual(250);
    expect(o.billing.trials_converted).toBeGreaterThanOrEqual(1);
  });

  it("finds trials ending soon for the reminder email, once", async () => {
    const me = await newUser("reminder");
    const unconfirmed = await newUser("reminder-unconfirmed");
    await setMembership(unconfirmed, "trial", new Date(Date.now() + 2 * 86_400_000).toISOString());
    await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [me]);
    await setMembership(me, "trial", new Date(Date.now() + 2 * 86_400_000).toISOString());
    await logWorkout(me, await workout(me), [[{ weight: 20, reps: 10, done: true }, { weight: 20, reps: 8, done: true }]]);
    const due = async () => (await as(anon, (q) => q("select * from trial_reminders_due($1)", [SECRET]))).filter((r) => r.user_id === me);
    const [row] = await due();
    expect(row).toMatchObject({ workouts: 1, working_sets: 2, weight_unit: "kg" });
    expect(Number(row.volume_kg)).toBe(360);
    expect(row.email).toMatch(/@/);
    await as(anon, (q) => q("select mark_trial_reminded($1, $2)", [SECRET, me]));
    expect(await due()).toHaveLength(0);
    // Unconfirmed addresses are never emailed.
    expect((await as(anon, (q) => q("select user_id from trial_reminders_due($1)", [SECRET]))).some((r) => r.user_id === unconfirmed)).toBe(false);
  });

  it("admins can give friends free access: now for existing accounts, on sign-up for invitees", async () => {
    const admin = await newUser("free-admin");
    await pool.query("insert into admins (user_id) values ($1) on conflict do nothing", [admin]);
    const stranger = await newUser("free-stranger");
    const grant = (uid: string, email: string, note: string | null = null) =>
      as(user(uid), async (q) => (await q("select admin_grant_free_access($1, $2) as r", [email, note]))[0].r);
    await expect(grant(stranger, "x@example.com")).rejects.toThrow(/not_admin/);
    await expect(grant(admin, "not-an-email")).rejects.toThrow(/invalid_email/);

    // Existing account on a trial: free straight away.
    const friend = await newUser("free-friend");
    await setMembership(friend, "trial", new Date(Date.now() + 86_400_000).toISOString());
    const friendEmail = (await pool.query("select email from auth.users where id = $1", [friend])).rows[0].email;
    expect(await grant(admin, friendEmail.toUpperCase(), "Gym buddy")).toMatchObject({ result: "granted", was_paying: false });
    expect(await member(friend)).toMatchObject({ status: "founder", trial_ends_at: null, note: "Gym buddy" });
    expect(await grant(admin, friendEmail)).toMatchObject({ result: "already_free" });

    // New person: invited, then free (not a trial) when they sign up with that address.
    const invitee = `invitee-${Date.now()}@example.com`;
    expect(await grant(admin, ` ${invitee} `, "Sister")).toEqual({ result: "invited", email: invitee });
    const list = await as(user(admin), async (q) => (await q("select admin_free_access_list() as l"))[0].l);
    expect(list.pending.map((x: { email: string }) => x.email)).toContain(invitee);
    await expect(as(user(stranger), (q) => q("select admin_free_access_list()"))).rejects.toThrow(/not_admin/);

    await pool.query("update app_settings set auto_founder = false where id");
    try {
      const { rows } = await pool.query(
        `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, '{"provider":"email"}', '{}', now(), now()) returning id`,
        [invitee],
      );
      users.push(rows[0].id);
      expect(await member(rows[0].id)).toMatchObject({ status: "founder", note: "Free access: Sister" });
      // Someone else signing up still gets the normal trial.
      const regular = await newUser("free-regular");
      expect((await member(regular)).status).toBe("trial");
    } finally {
      await pool.query("update app_settings set auto_founder = true where id");
    }
    expect((await pool.query("select accepted_at from free_access_invites where email = $1", [invitee])).rows[0].accepted_at).not.toBeNull();

    // Revoking a pending invite.
    await grant(admin, "later@example.com");
    await as(user(admin), (q) => q("select admin_revoke_invite('LATER@example.com')"));
    expect((await pool.query("select count(*)::int as n from free_access_invites where email = 'later@example.com'")).rows[0].n).toBe(0);
    await pool.query("delete from free_access_invites where email = $1", [invitee]);
  });
});
