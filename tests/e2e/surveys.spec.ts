import { expect, test } from "@playwright/test";
import { db, newUser, seedSplit, signIn, type TestUser } from "./helpers";

const answer = async (uid: string, question: string) =>
  (await db.query("select answer, detail from public.survey_answers where user_id = $1 and question = $2", [uid, question])).rows[0];

/** Logs and finishes a one-set workout through the API; returns the session id. */
async function finishedWorkout(user: TestUser) {
  const { templateId } = await seedSplit(user, "Survey split", "Push", ["back-squat"]);
  const { data: doc } = await user.client.rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: templateId }).throwOnError();
  const payload = {
    notes: null,
    exercises: doc.exercises.map((ex: { id: string }, i: number) => ({
      ...ex,
      position: i,
      sets: [{ id: crypto.randomUUID(), position: 0, set_type: "working", weight_kg: 60, reps: 8, completed_at: new Date().toISOString() }],
    })),
  };
  const { data: synced } = await user.client.rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: payload }).throwOnError();
  await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
  return doc.id as string;
}

test("a new trial member is asked once how they heard about us, mid-trial how it's going, and why when it ends", async ({ page }) => {
  const sam = await newUser("survey-sam");
  await db.query("update public.memberships set status = 'trial', trial_ends_at = now() + interval '12 days', free_access = false where user_id = $1", [sam.id]);
  await signIn(page, sam);

  // Train: one tap answers, and it isn't asked again.
  const heard = page.getByRole("region", { name: "How did you hear about NotchLift?" });
  await expect(heard).toBeVisible();
  await heard.getByRole("button", { name: "Instagram" }).click();
  await expect(page.getByText("That helps us know where to find more people like you")).toBeVisible();
  expect(await answer(sam.id, "heard_from")).toEqual({ answer: "instagram", detail: null });
  await page.reload();
  await expect(page.getByRole("region", { name: "How did you hear about NotchLift?" })).toHaveCount(0);

  // Day 5 of the trial, straight after finishing a workout.
  const sessionId = await finishedWorkout(sam);
  await db.query("update auth.users set created_at = now() - interval '5 days' where id = $1", [sam.id]);
  await page.goto(`/sessions/${sessionId}?finished=1`);
  const pulse = page.getByRole("region", { name: "How’s NotchLift working for you so far?" });
  await expect(pulse).toBeVisible();
  await pulse.getByRole("button", { name: /It’s OK/ }).click();
  await pulse.getByLabel("What one thing would make it better? (optional)").fill("A plate calculator");
  await pulse.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks! Every answer is read.")).toBeVisible();
  expect(await answer(sam.id, "trial_pulse")).toEqual({ answer: "ok", detail: "A plate calculator" });
  // Viewing the workout later doesn't ask.
  await page.goto(`/sessions/${sessionId}`);
  await expect(page.getByText("How’s NotchLift working for you so far?")).toHaveCount(0);

  // The trial ends unpaid: the plan page asks why.
  await db.query("update public.memberships set trial_ends_at = now() - interval '1 hour' where user_id = $1", [sam.id]);
  await page.goto("/upgrade?reason=trial_ended#why");
  const exit = page.getByRole("region", { name: "What stopped you from choosing a plan?" });
  await expect(exit).toBeVisible();
  await exit.getByRole("button", { name: "Missing a feature" }).click();
  await exit.getByLabel("Which feature?").fill("Supersets");
  await exit.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks for telling us")).toBeVisible();
  expect(await answer(sam.id, "trial_exit")).toEqual({ answer: "missing_feature", detail: "Supersets" });
});

test("skipping a question means it isn't asked again; admins see answers and comments", async ({ page, browser }) => {
  const jo = await newUser("survey-jo");
  await db.query("update public.memberships set status = 'trial', trial_ends_at = now() - interval '1 day', free_access = false where user_id = $1", [jo.id]);
  await signIn(page, jo);
  // On Train, an ended trial is asked why first; skipping leaves where they heard about us for next time.
  const exit = page.getByRole("region", { name: "What stopped you from choosing a plan?" });
  await exit.getByRole("button", { name: "Skip" }).click();
  await expect(exit).toHaveCount(0);
  expect(await answer(jo.id, "trial_exit")).toEqual({ answer: "skipped", detail: null });
  await page.reload();
  await expect(page.getByRole("region", { name: "How did you hear about NotchLift?" })).toBeVisible();
  await expect(page.getByRole("region", { name: "What stopped you from choosing a plan?" })).toHaveCount(0);

  const poster = `A gym poster ${jo.id.slice(0, 8)}`;
  await db.query("insert into public.survey_answers (user_id, question, answer, detail) values ($1, 'heard_from', 'other', $2)", [jo.id, poster]);
  const admin = await newUser("survey-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  const ctx = await browser.newContext({ ...test.info().project.use });
  const adminPage = await ctx.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto("/admin");
  const section = adminPage.getByRole("region", { name: "Feedback" });
  await expect(section.getByText(poster)).toBeVisible();
  await expect(section.getByRole("link", { name: jo.email })).toHaveAttribute("href", `mailto:${jo.email}`);
  await ctx.close();
});
