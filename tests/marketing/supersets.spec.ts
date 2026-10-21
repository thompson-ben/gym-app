import { expect, test } from "@playwright/test";
import { db, logSet, newUser, signIn } from "../e2e/helpers";

/**
 * Landing-page screenshot of a superset mid-workout: bench and row back to back, with a few
 * weeks of sample history so "last time" is filled in. Sample data on the local stack only.
 */

const DAY = 86_400_000;

const PLAN = {
  name: "Upper / Lower",
  description: "Sample split",
  workouts: [
    {
      name: "Upper",
      exercises: [
        { slug: "barbell-bench-press", sets: 3, rep_min: 6, rep_max: 10, rest_seconds: 120, superset_next: true },
        { slug: "barbell-row", sets: 3, rep_min: 6, rep_max: 10, rest_seconds: 120 },
        { slug: "ez-bar-curl", sets: 3, rep_min: 8, rep_max: 12, rest_seconds: 60, superset_next: true },
        { slug: "triceps-pushdown", sets: 3, rep_min: 8, rep_max: 12, rest_seconds: 60 },
      ],
    },
  ],
};

/** Weight (kg) and reps per set for the two sample sessions, per exercise position. */
const HISTORY: [number, number[]][][] = [
  [[65, [8, 8, 7]], [57.5, [9, 9, 8]], [27.5, [10, 10, 9]], [27.5, [11, 10, 10]]],
  [[67.5, [8, 7, 7]], [60, [8, 8, 8]], [27.5, [11, 11, 10]], [30, [10, 10, 9]]],
];

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test("superset screenshot", async ({ page }) => {
  const user = await newUser("landing-superset");
  const { data: splitId } = await user.client.rpc("create_split_from_plan", { p_plan: PLAN, p_activate: true }).throwOnError();
  await user.client.from("profiles").upsert({ id: user.id, display_name: "Alex" }).throwOnError();
  await db.query("update public.split_active_periods set started_at = now() - interval '20 days' where user_id = $1", [user.id]);
  const { data: tpl } = await user.client.from("workout_templates").select("id").eq("split_id", splitId).single().throwOnError();

  for (const [k, session] of HISTORY.entries()) {
    const when = new Date(Date.now() - (10 - k * 4) * DAY);
    when.setUTCHours(17, 30, 0, 0);
    const { data: doc } = await user.client
      .rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: tpl!.id, p_performed_at: when.toISOString() })
      .throwOnError();
    const exercises = doc.exercises.map((ex: object, pos: number) => ({
      ...ex,
      position: pos,
      sets: session[pos][1].map((reps, j) => ({
        id: crypto.randomUUID(),
        position: j,
        set_type: "working",
        weight_kg: session[pos][0],
        reps,
        completed_at: new Date(when.getTime() + (pos * 8 + j * 2) * 60_000).toISOString(),
      })),
    }));
    const { data: synced } = await user.client
      .rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: { notes: null, exercises } })
      .throwOnError();
    await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
  }

  await page.addInitScript(() => {
    for (const id of ["train", "workout", "splits", "progress"]) window.localStorage.setItem(`splitmate-tip:${id}`, "1");
    window.localStorage.setItem("splitmate-install-hint-dismissed", "1");
  });
  await signIn(page, user);
  await page.goto(`/train/workout/${tpl!.id}`);
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL("**/workout/**");

  // One round done: bench then row, with the next round waiting at bench.
  await logSet(page, "Barbell Bench Press", 1, 8, 67.5);
  await logSet(page, "Barbell Row", 1, 9, 60);
  const group = page.getByRole("region", { name: "Superset A" });
  await group.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72));
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "public/landing/superset.png" });
});
