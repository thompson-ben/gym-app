import { afterAll, describe, expect, it } from "vitest";
import { anon, as, catalogueId, createSplit, createTemplate, createUser, deleteUsers, logWorkout, pool, user } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";
const DAY = 86_400_000;
const tag = `srv-${Date.now()}`;

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string, opts: { createdDaysAgo?: number } = {}) {
  const id = await createUser(label);
  users.push(id);
  await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [id]);
  if (opts.createdDaysAgo) await pool.query("update auth.users set created_at = now() - make_interval(days => $2) where id = $1", [id, opts.createdDaysAgo]);
  return id;
}

const trialEnds = (uid: string, inDays: number) =>
  pool.query("update memberships set status = 'trial', trial_ends_at = $2 where user_id = $1", [uid, new Date(Date.now() + inDays * DAY).toISOString()]);
const prompts = (uid: string) => as(user(uid), async (q) => (await q("select my_survey_prompts() as p"))[0].p as string[]);
const submit = (uid: string, question: string, answer: string, detail: string | null = null) =>
  as(user(uid), (q) => q("select submit_survey($1, $2, $3)", [question, answer, detail]));
const answer = async (uid: string, question: string) =>
  (await pool.query("select answer, detail from survey_answers where user_id = $1 and question = $2", [uid, question])).rows[0];

async function train(uid: string) {
  const dip = await catalogueId("dip");
  const split = await createSplit(uid, "S");
  const { templateId } = await createTemplate(uid, split, "W", [{ exerciseId: dip }]);
  return logWorkout(uid, templateId, [[{ weight: 20, reps: 8, done: true }]]);
}

async function withSecret<T>(fn: () => Promise<T>) {
  const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
  await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
  try {
    return await fn();
  } finally {
    await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
  }
}

describe("one-question surveys (migration 19)", () => {
  it("asks new accounts where they heard about Setmodo, once, and accepts only known answers", async () => {
    const sam = await newUser("srv-new");
    await trialEnds(sam, 14);
    expect(await prompts(sam)).toEqual(["heard_from"]);
    await expect(submit(sam, "heard_from", "billboard")).rejects.toThrow(/invalid_answer/);
    await expect(submit(sam, "cancel_reason", "too_expensive")).rejects.toThrow(/invalid_answer/);
    await submit(sam, "heard_from", "friend", "  My gym buddy  ");
    expect(await answer(sam, "heard_from")).toEqual({ answer: "friend", detail: "My gym buddy" });
    expect(await prompts(sam)).toEqual([]);

    // Older accounts aren't asked.
    const old = await newUser("srv-old", { createdDaysAgo: 40 });
    expect(await prompts(old)).not.toContain("heard_from");
    await expect(as(anon, (q) => q("select submit_survey('heard_from', 'friend')"))).rejects.toThrow();
  });

  it("asks how the trial is going from day 4, after a workout, and why after it ends unpaid", async () => {
    const jo = await newUser("srv-trial", { createdDaysAgo: 2 });
    await trialEnds(jo, 12);
    await submit(jo, "heard_from", "skipped");
    await train(jo);
    expect(await prompts(jo)).toEqual([]); // too early

    await pool.query("update auth.users set created_at = now() - interval '5 days' where id = $1", [jo]);
    expect(await prompts(jo)).toEqual(["trial_pulse"]);
    await submit(jo, "trial_pulse", "great");
    expect(await prompts(jo)).toEqual([]);

    await trialEnds(jo, -1);
    expect(await prompts(jo)).toEqual(["trial_exit"]);
    await submit(jo, "trial_exit", "missing_feature", "Supersets please");
    expect(await prompts(jo)).toEqual([]);

    // A trial that ended after paying, or a paying member, isn't asked why they left.
    const payer = await newUser("srv-payer");
    await submit(payer, "heard_from", "instagram");
    await pool.query("update memberships set status = 'paid', trial_ends_at = null where user_id = $1", [payer]);
    expect(await prompts(payer)).toEqual([]);
  });

  it("emails ended trials once, stores Stripe cancellation reasons, all behind the billing secret", async () => {
    await withSecret(async () => {
      const ended = await newUser("srv-ended", { createdDaysAgo: 15 });
      await trialEnds(ended, -1);
      const answered = await newUser("srv-answered", { createdDaysAgo: 15 });
      await trialEnds(answered, -1);
      await submit(answered, "trial_exit", "too_expensive");
      const due = async () => ((await as(anon, (q) => q("select * from trial_exit_emails_due($1)", [SECRET]))) as { user_id: string }[]).map((r) => r.user_id);

      await expect(as(anon, (q) => q("select * from trial_exit_emails_due('nope')"))).rejects.toThrow(/billing_forbidden/);
      expect(await due()).toContain(ended);
      expect(await due()).not.toContain(answered);
      await as(anon, (q) => q("select mark_trial_exit_emailed($1, $2)", [SECRET, ended]));
      expect(await due()).not.toContain(ended);

      const member = await newUser("srv-cancel");
      await expect(as(anon, (q) => q("select record_cancellation_reason('nope', $1, 'unused')", [member]))).rejects.toThrow(/billing_forbidden/);
      await as(anon, (q) => q("select record_cancellation_reason($1, $2, 'not_a_reason')", [SECRET, member]));
      expect(await answer(member, "cancel_reason")).toBeUndefined();
      await as(anon, (q) => q("select record_cancellation_reason($1, $2, 'too_expensive', 'Money is tight')", [SECRET, member]));
      expect(await answer(member, "cancel_reason")).toEqual({ answer: "too_expensive", detail: "Money is tight" });
    });
  });

  it("shows admins totals by answer and campaign, without test accounts, and nobody else", async () => {
    const admin = await newUser("srv-admin");
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    const a = await newUser("srv-a");
    const b = await newUser("srv-b");
    const tester = await newUser("srv-tester");
    for (const uid of [a, b, tester]) {
      await as(user(uid), (q) => q("select record_attribution($1)", [JSON.stringify({ utm_source: "facebook", utm_campaign: tag, utm_content: "fast-image" })]));
      await submit(uid, "heard_from", "facebook");
    }
    await submit(a, "trial_exit", "other_app", "Went back to Strong");
    await pool.query("insert into analytics_excluded_users (user_id) values ($1)", [tester]);

    await expect(as(user(a), (q) => q("select admin_surveys(30)"))).rejects.toThrow(/not_admin/);
    await expect(as(user(a), (q) => q("select * from survey_answers"))).rejects.toThrow();
    const r = await as(user(admin), async (q) => (await q("select admin_surveys(30) as r"))[0].r);
    const row = r.by_campaign.find((x: { campaign: string; question: string }) => x.campaign === tag && x.question === "heard_from");
    expect(row).toMatchObject({ source: "facebook", content: "fast-image", answer: "facebook", count: 2 });
    expect(r.comments.find((c: { detail: string }) => c.detail === "Went back to Strong")).toMatchObject({ question: "trial_exit", answer: "other_app", campaign: tag });
  });
});
