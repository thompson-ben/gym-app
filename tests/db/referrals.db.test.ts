import { afterAll, describe, expect, it } from "vitest";
import { as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user, type SetInput } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";
const DAY = 86_400_000;

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string, opts: { email?: string; confirmed?: boolean; createdDaysAgo?: number } = {}) {
  const id = await createUser(label);
  users.push(id);
  if (opts.email) await pool.query("update auth.users set email = $2 where id = $1", [id, opts.email]);
  if (opts.confirmed !== false) await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [id]);
  if (opts.createdDaysAgo) await pool.query("update auth.users set created_at = now() - make_interval(days => $2) where id = $1", [id, opts.createdDaysAgo]);
  return id;
}

const onTrial = (uid: string, endsInDays: number) =>
  pool.query("update memberships set status = 'trial', trial_ends_at = $2, referral_reward_at = null where user_id = $1", [uid, new Date(Date.now() + endsInDays * DAY).toISOString()]);
const member = async (uid: string) => (await pool.query("select * from memberships where user_id = $1", [uid])).rows[0];
const referral = async (uid: string) => (await pool.query("select * from referrals where referred_id = $1", [uid])).rows[0];
const code = (uid: string) => as(user(uid), async (q) => (await q("select my_referral_code() as c"))[0].c as string);
const arriveWith = (uid: string, ref: string) => as(user(uid), (q) => q("select record_attribution($1)", [JSON.stringify({ landing_path: "/", ref, utm_source: "referral" })]));

let dip: string;
async function train(uid: string, sets: SetInput[][] = [[{ weight: 20, reps: 8, done: true }]]) {
  dip ??= await catalogueId("dip");
  const split = await createSplit(uid, "S");
  const { templateId } = await createTemplate(uid, split, "W", [{ exerciseId: dip }]);
  return logWorkout(uid, templateId, sets);
}
const daysBetween = (a: string | Date, b: string | Date) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY);

describe("referrals (migration 18)", () => {
  it("gives a code, and 14 more trial days once the invited friend finishes a real workout", async () => {
    const ben = await newUser("ref-ben", { createdDaysAgo: 5 });
    await onTrial(ben, 9);
    const c = await code(ben);
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await code(ben)).toBe(c); // stable

    const sam = await newUser("ref-sam");
    await arriveWith(sam, c.toLowerCase());
    expect(await referral(sam)).toMatchObject({ referrer_id: ben, via: "link", qualified_at: null });
    const before = (await member(ben)).trial_ends_at;

    // Signing up alone doesn't count; a warm-up-only workout doesn't either.
    await train(sam, [[{ weight: 10, reps: 8, done: true, type: "warmup" }]]);
    expect((await member(ben)).referral_reward_at).toBeNull();

    await train(sam);
    expect((await referral(sam)).qualified_at).not.toBeNull();
    const after = await member(ben);
    expect(after.referral_reward_at).not.toBeNull();
    expect(daysBetween(after.trial_ends_at, before)).toBe(14);

    const status = await as(user(ben), async (q) => (await q("select my_referral_status() as s"))[0].s);
    expect(status).toMatchObject({ code: c, invited: 1, training: 1 });
    expect(status.rewarded_at).not.toBeNull();

    // Only once: a second friend is recorded but earns nothing more.
    const jo = await newUser("ref-jo");
    await arriveWith(jo, c);
    await train(jo);
    expect((await referral(jo)).qualified_at).not.toBeNull();
    expect((await referral(jo)).rewarded_at).toBeNull();
    expect((await member(ben)).trial_ends_at).toEqual(after.trial_ends_at);
  });

  it("restarts an expired trial for 14 days when the friend signed up in time but trained late", async () => {
    const ben = await newUser("ref-late-ben", { createdDaysAgo: 20 });
    await onTrial(ben, 1);
    const sam = await newUser("ref-late-sam");
    await arriveWith(sam, await code(ben));
    // Sam signed up three days ago, Ben's trial ended two days ago, and Sam trains today.
    await pool.query("update referrals set created_at = now() - interval '3 days' where referred_id = $1", [sam]);
    await pool.query("update memberships set trial_ends_at = now() - interval '2 days' where user_id = $1", [ben]);
    await train(sam);
    const m = await member(ben);
    expect(daysBetween(m.trial_ends_at, new Date())).toBe(14);
    expect(await as(user(ben), async (q) => (await q("select can_start_workout() as c"))[0].c)).toBe(true);
  });

  it("doesn't reward friends who signed up after the trial ended, paying members, or unconfirmed friends", async () => {
    const late = await newUser("ref-after-ben", { createdDaysAgo: 30 });
    await onTrial(late, 5);
    const lateCode = await code(late);
    await pool.query("update memberships set trial_ends_at = now() - interval '3 days' where user_id = $1", [late]);
    const f1 = await newUser("ref-after-friend");
    await arriveWith(f1, lateCode);
    await train(f1);
    expect((await member(late)).referral_reward_at).toBeNull();

    const payer = await newUser("ref-payer", { createdDaysAgo: 3 });
    await pool.query("update memberships set status = 'paid', trial_ends_at = null where user_id = $1", [payer]);
    const f2 = await newUser("ref-payer-friend");
    await arriveWith(f2, await code(payer));
    await train(f2);
    expect((await referral(f2)).qualified_at).not.toBeNull();
    expect((await member(payer)).referral_reward_at).toBeNull();

    const ben = await newUser("ref-unconf-ben", { createdDaysAgo: 2 });
    await onTrial(ben, 12);
    const f3 = await newUser("ref-unconf-friend", { confirmed: false });
    await arriveWith(f3, await code(ben));
    await train(f3);
    expect((await referral(f3)).qualified_at).toBeNull();
    expect((await member(ben)).referral_reward_at).toBeNull();
  });

  it("ignores self-referrals, unknown codes and older accounts", async () => {
    const ben = await newUser("ref-self", { email: `ben.smith+main${Date.now()}@gmail.com`, createdDaysAgo: 1 });
    const c = await code(ben);
    const alias = await newUser("ref-self-alias", { email: `bensmith+alt${Date.now()}@gmail.com` });
    await arriveWith(alias, c);
    expect(await referral(alias)).toBeUndefined();
    await arriveWith(ben, c);
    expect(await referral(ben)).toBeUndefined();

    const stranger = await newUser("ref-unknown");
    await arriveWith(stranger, "ZZZZZZZZ");
    expect(await referral(stranger)).toBeUndefined();

    const old = await newUser("ref-old", { createdDaysAgo: 20 });
    await arriveWith(old, c);
    expect(await referral(old)).toBeUndefined();
  });

  it("counts joining a group workout and copying a shared split as referrals by the host or sharer", async () => {
    const host = await newUser("ref-host", { createdDaysAgo: 3 });
    await onTrial(host, 11);
    dip ??= await catalogueId("dip");
    const split = await createSplit(host, "PPL");
    const { templateId } = await createTemplate(host, split, "Push", [{ exerciseId: dip }]);
    const groupId = await as(user(host), async (q) => (await q("select create_group_workout('Push', 'Ben', $1) as id", [templateId]))[0].id);
    const token = (await pool.query("select invite_token from group_workouts where id = $1", [groupId])).rows[0].invite_token;
    const sam = await newUser("ref-group-sam");
    await as(user(sam), (q) => q("select join_group_workout($1, 'Sam')", [token]));
    expect(await referral(sam)).toMatchObject({ referrer_id: host, via: "group" });

    const share = await as(user(host), async (q) => (await q("select * from upsert_split_share($1, 'PPL', null, false)", [split]))[0]);
    const jo = await newUser("ref-split-jo");
    await as(user(jo), (q) => q("select copy_shared_split($1, '{}'::jsonb)", [share.token]));
    expect(await referral(jo)).toMatchObject({ referrer_id: host, via: "split" });
  });

  it("lists rewards for the daily email (billing secret only) and shows totals to admins", async () => {
    const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
    await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
    try {
      const ben = await newUser("ref-mail-ben", { createdDaysAgo: 2 });
      await onTrial(ben, 12);
      const sam = await newUser("ref-mail-sam");
      await arriveWith(sam, await code(ben));
      await train(sam);
      await expect(as(user(ben), (q) => q("select * from referral_rewards_to_notify('nope')"))).rejects.toThrow(/billing_forbidden/);
      const due = async () =>
        (await as(user(ben), (q) => q("select * from referral_rewards_to_notify($1)", [SECRET]))).filter((r: { user_id: string }) => r.user_id === ben);
      expect(await due()).toHaveLength(1);
      await as(user(ben), (q) => q("select mark_referral_notified($1, $2)", [SECRET, ben]));
      expect(await due()).toHaveLength(0);

      await expect(as(user(ben), (q) => q("select admin_referrals(30)"))).rejects.toThrow(/not_admin/);
      const admin = await newUser("ref-admin");
      await pool.query("insert into admins (user_id) values ($1)", [admin]);
      const totals = await as(user(admin), async (q) => (await q("select admin_referrals(30) as r"))[0].r);
      expect(totals.rewards).toBeGreaterThanOrEqual(1);
      expect(totals.qualified).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(totals)).not.toMatch(/@/);
    } finally {
      await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
    }
  });

  it("users cannot read or write referral tables directly", async () => {
    const someone = await newUser("ref-snoop");
    await expect(as(user(someone), (q) => q("select * from referrals"))).rejects.toThrow();
    await expect(as(user(someone), (q) => q("select * from referral_codes"))).rejects.toThrow();
    await expect(as(user(someone), (q) => q("select link_referral($1, $1, 'link')", [someone]))).rejects.toThrow();
  });
});
