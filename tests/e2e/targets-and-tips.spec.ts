import { expect, test } from "@playwright/test";
import { catalogueId, logSet, newUser, signIn, type TestUser } from "./helpers";

const RAISE = "Dumbbell Lateral Raise";

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

async function seed(user: TestUser) {
  const { data: split } = await user.client.from("splits").insert({ name: "Arms" }).select("id").single().throwOnError();
  const { data: tpl } = await user.client.from("workout_templates").insert({ split_id: split!.id, name: "Shoulders & Arms" }).select("id").single().throwOnError();
  await user.client
    .from("template_exercises")
    .insert({ template_id: tpl!.id, exercise_id: await catalogueId("dumbbell-lateral-raise"), position: 0, target_sets: 3, rep_min: 12, rep_max: 20 })
    .throwOnError();
  await user.client.rpc("activate_split", { p_split_id: split!.id }).throwOnError();
  return tpl!.id as string;
}

test("top of range last time nudges, targets switch on from the logger, and hitting them is celebrated", async ({ page }) => {
  const user = await newUser("celebrate");
  const templateId = await seed(user);
  await logPast(user, templateId, 3, [[6.25, 20], [6.25, 20], [6.25, 20]]);

  await signIn(page, user);
  await page.getByRole("button", { name: "Start Shoulders & Arms" }).click();
  await page.waitForURL("**/workout/**");
  const card = page.getByRole("region", { name: RAISE });
  await expect(card.getByText("Ready to go heavier.")).toBeVisible();
  await expect(card.getByText("Last time every working set reached 20 reps, the top of your range.")).toBeVisible();

  await card.getByRole("button", { name: "Suggest a target weight" }).click();
  const sheet = page.getByRole("dialog", { name: `Targets · ${RAISE}` });
  await sheet.getByLabel("Weight increment (kg)").fill("1.25");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  // The nudge becomes a concrete target.
  await expect(card.getByText("7.5 kg × 12")).toBeVisible();
  await expect(card.getByText("Ready to go heavier.")).toHaveCount(0);
  await card.getByRole("button", { name: "Use 7.5 kg for remaining sets" }).click();

  await logSet(page, RAISE, 1, 12);
  await logSet(page, RAISE, 2, 13);
  await expect(card.getByText("Target hit!")).toHaveCount(0);
  await logSet(page, RAISE, 3, 12);
  await expect(card.getByText("Target hit!")).toBeVisible();
  await expect(card.getByText("Every set at 7.5 kg × 12 or better.")).toBeVisible();
  // Undoing a set removes it again: the banner reflects what is actually logged. (A second
  // tap within 400 ms is ignored as a double tap, so wait like a person would.)
  await page.waitForTimeout(500);
  await card.getByRole("button", { name: /set 3 completed/ }).click();
  await expect(card.getByText("Target hit!")).toHaveCount(0);
});

test("one-time tips explain each screen and can be brought back from Profile", async ({ page }) => {
  const user = await newUser("tips");
  await seed(user);
  await signIn(page, user);
  const tip = page.getByRole("complementary", { name: "Tip: Your training home" });
  await expect(tip).toBeVisible();
  await tip.getByRole("button", { name: "Got it" }).click();
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Tip: Your training home" })).toHaveCount(0);

  await page.goto("/splits");
  await expect(page.getByRole("complementary", { name: "Tip: How splits work" })).toBeVisible();

  await page.goto("/profile");
  await page.getByRole("button", { name: /Show tips again/ }).click();
  await page.goto("/train");
  await expect(page.getByRole("complementary", { name: "Tip: Your training home" })).toBeVisible();
});
