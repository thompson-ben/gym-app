import { expect, test } from "@playwright/test";
import { catalogueId, db, expectNoHorizontalScroll, logSet, newUser, seedSplit, signIn, type TestUser } from "./helpers";

const SQUAT = "Barbell Back Squat";

test.afterAll(async () => {
  await db.end();
});

// Recorded so the PR can show the flow (see docs/). Video only; not an assertion.
test.use({ video: process.env.E2E_VIDEO ? "on" : "off" });

/** Logs and finishes a workout through the API, performed `daysAgo` days ago. */
async function logPast(user: TestUser, templateId: string, daysAgo: number, sets: [number, number][]) {
  const { data: doc } = await user.client
    .rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: templateId, p_performed_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() })
    .throwOnError();
  const payload = {
    notes: null,
    exercises: doc.exercises.map((ex: { id: string }, i: number) => ({
      ...ex,
      position: i,
      sets: sets.map(([w, r], j) => ({ id: crypto.randomUUID(), position: j, set_type: "working", weight_kg: w, reps: r, completed_at: new Date().toISOString() })),
    })),
  };
  const { data: synced } = await user.client.rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: payload }).throwOnError();
  await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
}

test("Train → preview → log with an optional target → summary → split review", async ({ page }) => {
  const user = await newUser("daily");
  const { splitId, templateId: legs } = await seedSplit(user, "Two-day split", "Legs", ["back-squat"], false);
  const { data: upper } = await user.client.from("workout_templates").insert({ split_id: splitId, name: "Upper", position: 1 }).select("id").single().throwOnError();
  await user.client.from("template_exercises").insert({ template_id: upper!.id, exercise_id: await catalogueId("lat-pulldown"), position: 0, target_sets: 2, rep_min: 8, rep_max: 12 }).throwOnError();
  await user.client.rpc("activate_split", { p_split_id: splitId, p_started_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }).throwOnError();
  // Opt in to targets for squats with a 2.5 kg increment.
  await user.client.from("template_exercises").update({ progression_enabled: true, progression_increment_kg: 2.5 }).eq("template_id", legs).throwOnError();
  await logPast(user, legs, 3, [[100, 12], [100, 12]]);

  await signIn(page, user);
  // Upper has never been done, so it is suggested before Legs.
  await expect(page.getByText("Suggested next")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Upper" })).toBeVisible();
  await expect(page.getByText("Not done yet in this split")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.locator('a[href^="/train/workout/"]', { hasText: "Legs" }).click();
  await expect(page.getByRole("heading", { name: "Legs" })).toBeVisible();
  await expect(page.getByText("Last: 100 × 12, 100 × 12")).toBeVisible();
  await expect(page.getByText("102.5 kg × 8")).toBeVisible();
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL("**/workout/**");

  // The target is shown apart from Previous and is not a set until confirmed.
  const card = page.getByRole("region", { name: SQUAT });
  await expect(card.getByText("You reached the top of your rep range on all working sets.")).toBeVisible();
  await expect(card.getByLabel("Previous: 100 × 12").first()).toBeVisible();
  await card.getByRole("button", { name: "Use 102.5 kg for remaining sets" }).click();
  await expect(card.getByLabel(`${SQUAT}, set 1 weight in kg`)).toHaveValue("102.5");
  await expect(card.getByLabel(`${SQUAT}, set 1 reps`)).toHaveValue("");
  await expect(page.getByRole("group", { name: `${SQUAT}, set 1, next to do` })).toHaveAttribute("aria-current", "step");

  await logSet(page, SQUAT, 1, 8);
  // A double tap on Done must not confirm and then undo.
  const set2 = page.getByRole("group", { name: `${SQUAT}, set 2` });
  await set2.getByLabel(/reps$/).fill("8");
  await set2.getByRole("button", { name: /Confirm/ }).dblclick();
  await expect(set2.getByRole("button", { name: /completed/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await page.waitForURL("**/sessions/**");
  await expect(page.getByText("Workout saved")).toBeVisible();
  await expect(page.getByText("1 exercise · 2 working sets")).toBeVisible();
  await expect(page.getByText("Heaviest load: 102.5 kg (previous 100 kg)")).toBeVisible();
  await expect(page.getByText("vs last time: Up from 100 kg to 102.5 kg")).toBeVisible();
  // 8 reps is within the range, so next time keeps the weight and aims for more reps.
  await expect(page.getByText("102.5 kg × 9")).toBeVisible();

  // Exactly the two confirmed sets were recorded; the suggestion never became a set.
  const { rows } = await db.query(
    `select ss.weight_kg::float as w, ss.reps from session_sets ss
     join session_exercises se on se.id = ss.session_exercise_id
     join workout_sessions ws on ws.id = se.session_id
     where ws.user_id = $1 and ws.is_backdated = false order by ss.position`,
    [user.id],
  );
  expect(rows).toEqual([{ w: 102.5, reps: 8 }, { w: 102.5, reps: 8 }]);

  await page.goto("/progress");
  await page.getByRole("link", { name: /Split review/ }).click();
  await expect(page.getByRole("heading", { name: "Two-day split" })).toBeVisible();
  await expect(page.getByText("Workouts completed")).toBeVisible();
  await expect(page.getByText(/Best set: 100 × 12 \(.+\) → 102\.5 × 8/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a brand-new split starts at its first workout; history and review are reachable", async ({ page }) => {
  const user = await newUser("fresh");
  const { splitId } = await seedSplit(user, "Fresh split", "Day 1", ["back-squat"]);
  const { data: day2 } = await user.client.from("workout_templates").insert({ split_id: splitId, name: "Day 2", position: 1 }).select("id").single().throwOnError();
  await user.client.from("template_exercises").insert({ template_id: day2!.id, exercise_id: await catalogueId("dip"), position: 0 }).throwOnError();
  await signIn(page, user);
  await expect(page.getByRole("heading", { level: 1, name: "Day 1" })).toBeVisible();
  await expect(page.getByText("First in your split order")).toBeVisible();
  await expect(page.getByText("Not performed yet", { exact: true })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText("No workouts yet")).toBeVisible();
});

test("one high-rep session still shows the chart with all metric tabs, opening on one with data", async ({ page }) => {
  const user = await newUser("onechart");
  const { templateId } = await seedSplit(user, "Arms", "Arms", ["triceps-pushdown"]);
  await logPast(user, templateId, 2, [[20, 20], [20, 20]]);
  await signIn(page, user);
  await page.goto("/progress");
  await page.getByRole("link", { name: /Triceps Pushdown/ }).first().click();
  for (const tab of ["Est. 1RM", "Volume", "Heaviest"]) await expect(page.getByRole("link", { name: tab, exact: true })).toBeVisible();
  // 20-rep sets give no 1RM estimate, so the page opens on Volume with a one-point chart.
  await expect(page.getByRole("heading", { name: "Session volume" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Session volume, 1 sessions/ })).toBeVisible();
  await expect(page.getByText("Your baseline is set.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Est. 1RM", exact: true }).click();
  await expect(page.getByText(/No estimate yet/)).toBeVisible();
});
