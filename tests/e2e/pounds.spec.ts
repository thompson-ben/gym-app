import { expect, test } from "@playwright/test";
import { catalogueId, db, logSet, newUser, signIn, type TestUser } from "./helpers";

const RAISE = "Dumbbell Lateral Raise";
const KG_PER_LB = 0.45359237;

async function seed(user: TestUser) {
  const { data: split } = await user.client.from("splits").insert({ name: "Arms" }).select("id").single().throwOnError();
  const { data: tpl } = await user.client.from("workout_templates").insert({ split_id: split!.id, name: "Shoulders" }).select("id").single().throwOnError();
  await user.client
    .from("template_exercises")
    .insert({ template_id: tpl!.id, exercise_id: await catalogueId("dumbbell-lateral-raise"), position: 0, target_sets: 2, rep_min: 12, rep_max: 20 })
    .throwOnError();
  await user.client.rpc("activate_split", { p_split_id: split!.id }).throwOnError();
  // A past workout at exactly 20 lb (stored as kg), every set at the top of the range.
  const { data: doc } = await user.client
    .rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: tpl!.id, p_performed_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    .throwOnError();
  const kg = Math.round(20 * KG_PER_LB * 10_000) / 10_000;
  const payload = {
    notes: null,
    exercises: doc.exercises.map((ex: { id: string }, i: number) => ({
      ...ex,
      position: i,
      sets: [0, 1].map((j) => ({ id: crypto.randomUUID(), position: j, set_type: "working", weight_kg: kg, reps: 20, completed_at: new Date().toISOString() })),
    })),
  };
  const { data: synced } = await user.client.rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: payload }).throwOnError();
  await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
}

test("a user can switch to pounds: logging, targets and history use lb, storage stays kg", async ({ page }) => {
  const user = await newUser("pounds");
  await seed(user);
  await signIn(page, user);

  await page.goto("/profile");
  await page.getByRole("radio", { name: "Pounds (lb)" }).click();
  await expect(page.getByRole("radio", { name: "Pounds (lb)" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Saved")).toBeVisible();
  const { rows: profile } = await db.query("select weight_unit from public.profiles where id = $1", [user.id]);
  expect(profile[0].weight_unit).toBe("lb");

  await page.goto("/train");
  await page.getByRole("button", { name: "Start Shoulders" }).click();
  await page.waitForURL("**/workout/**");
  const card = page.getByRole("region", { name: RAISE });
  // Last time's 9.0718 kg is prefilled as exactly 20 lb.
  await expect(card.getByLabel(`${RAISE}, set 1 weight in lb`)).toHaveValue("20");

  await card.getByRole("button", { name: "Suggest a target weight" }).click();
  const sheet = page.getByRole("dialog", { name: `Targets · ${RAISE}` });
  await sheet.getByLabel("Weight increment (lb)").fill("5");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(card.getByText("25 lb × 12")).toBeVisible();
  await card.getByRole("button", { name: "Use 25 lb for remaining sets" }).click();
  await expect(card.getByLabel(`${RAISE}, set 1 weight in lb`)).toHaveValue("25");

  await logSet(page, RAISE, 1, 12);
  await logSet(page, RAISE, 2, 14, 25.5);
  await expect(card.getByText("Every set at 25 lb × 12 or better.")).toBeVisible();

  // Stored canonically in kg, exact to the pound value typed.
  await expect
    .poll(async () => (await db.query("select weight_kg::text as w from public.session_sets where user_id = $1 and completed_at > now() - interval '1 hour' and reps in (12, 14) order by reps", [user.id])).rows.map((r) => r.w))
    .toEqual(["11.3398", "11.5666"]);
  const { rows: inc } = await db.query("select progression_increment_kg::text as i from public.template_exercises where user_id = $1", [user.id]);
  expect(inc[0].i).toBe("2.2680");
});
