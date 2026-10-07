import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { STARTERS } from "../../src/lib/starters";
import { catalogueId, db, logSet, newUser, signIn, type TestUser } from "../e2e/helpers";

/**
 * Landing-page screenshots. Builds a demo account with nine weeks of sample Push / Pull / Legs
 * training (double progression), then captures real app screens at iPhone size.
 */

const OUT = "public/landing";
const DAY = 86_400_000;
const PPL = STARTERS.find((s) => s.key === "push-pull-legs")!;

/** Starting weight and increment (kg) per exercise, for the simulated history. */
const START: Record<string, [number, number]> = {
  "barbell-bench-press": [60, 2.5],
  "seated-dumbbell-shoulder-press": [18, 2],
  "incline-dumbbell-press": [22, 2],
  "cable-lateral-raise": [7.5, 1.25],
  "triceps-pushdown": [25, 2.5],
  "lat-pulldown": [55, 2.5],
  "barbell-row": [50, 2.5],
  "face-pull": [20, 2.5],
  "ez-bar-curl": [25, 2.5],
  "hammer-curl": [12, 2],
  "back-squat": [80, 5],
  "barbell-romanian-deadlift": [70, 5],
  "leg-extension": [45, 5],
  "lying-leg-curl": [35, 2.5],
  "standing-calf-raise": [60, 5],
};

async function seed(user: TestUser) {
  const plan = { name: PPL.name, description: PPL.description, workouts: PPL.workouts };
  const { data: splitId } = await user.client.rpc("create_split_from_plan", { p_plan: plan, p_activate: true }).throwOnError();
  await user.client.from("profiles").upsert({ id: user.id, display_name: "Alex" }).throwOnError();
  const { data: templates } = await user.client
    .from("workout_templates")
    .select("id, name, template_exercises(id, exercise_id, target_sets, rep_min, rep_max)")
    .eq("split_id", splitId)
    .order("position")
    .throwOnError();

  const slugById = new Map<string, string>();
  for (const slug of Object.keys(START)) slugById.set(await catalogueId(slug), slug);

  // Targets on for Push, with each exercise's usual increment.
  const push = templates!.find((t) => t.name === "Push")!;
  for (const te of push.template_exercises) {
    await user.client.from("template_exercises").update({ progression_enabled: true, progression_increment_kg: START[slugById.get(te.exercise_id)!][1] }).eq("id", te.id).throwOnError();
  }

  // Progression per exercise: +2 reps per session up to the top of the range, then add weight.
  const state = new Map<string, { w: number; r: number }>();
  const weeks = 12;
  // The split has been active since just before the first sample session.
  await db.query("update public.split_active_periods set started_at = now() - interval '86 days' where user_id = $1", [user.id]);
  for (let week = 0; week < weeks; week++) {
    for (const [i, tpl] of templates!.entries()) {
      const daysAgo = (weeks - week) * 7 - i * 2 + 1;
      const when = new Date(Date.now() - daysAgo * DAY);
      when.setUTCHours(17, 30, 0, 0);
      const { data: doc } = await user.client
        .rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: tpl.id, p_performed_at: when.toISOString() })
        .throwOnError();
      const exercises = doc.exercises.map((ex: { id: string; exercise_id: string; target_sets: number; rep_min: number; rep_max: number }, pos: number) => {
        const slug = slugById.get(ex.exercise_id)!;
        const [w0, inc] = START[slug];
        const s = state.get(slug) ?? { w: w0, r: ex.rep_min + 1 };
        const sets = Array.from({ length: ex.target_sets }, (_, j) => ({
          id: crypto.randomUUID(),
          position: j,
          set_type: "working",
          weight_kg: s.w,
          // Bench keeps every set equal (it is the showcase target); others tire on the last set.
          reps: slug === "barbell-bench-press" || j < ex.target_sets - 1 ? s.r : Math.max(ex.rep_min, s.r - 1),
          completed_at: new Date(when.getTime() + (pos * 8 + j * 2) * 60_000).toISOString(),
        }));
        state.set(slug, s.r >= ex.rep_max ? { w: s.w + inc, r: ex.rep_min + 1 } : { w: s.w, r: Math.min(ex.rep_max, s.r + 2) });
        return { ...ex, position: pos, sets };
      });
      const { data: synced } = await user.client
        .rpc("sync_session", { p_session_id: doc.id, p_base_revision: 0, p_write_id: crypto.randomUUID(), p_doc: { notes: null, exercises } })
        .throwOnError();
      await user.client.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: synced.revision }).throwOnError();
    }
  }
}

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/workout/")) await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test("landing screenshots", async ({ page }) => {
  const user = await newUser("landing");
  await seed(user);
  await page.addInitScript(() => {
    for (const id of ["train", "workout", "splits", "progress"]) window.localStorage.setItem(`splitmate-tip:${id}`, "1");
    window.localStorage.setItem("splitmate-install-hint-dismissed", "1");
  });
  await signIn(page, user);

  await page.goto("/train");
  await expect(page.getByRole("button", { name: "Start Push" })).toBeVisible();
  await shot(page, "train");

  const bench = await catalogueId("barbell-bench-press");
  await page.goto(`/progress/${bench}`);
  await page.getByRole("link", { name: "Heaviest" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(/heaviest/i);
  await shot(page, "progress");

  await page.goto("/train");
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.waitForURL("**/workout/**");
  const card = page.getByRole("region", { name: "Barbell Bench Press" });
  await card.getByRole("button", { name: /^Use .* for remaining sets$/ }).click();
  await logSet(page, "Barbell Bench Press", 1, 6);
  await shot(page, "logger");

  await logSet(page, "Barbell Bench Press", 2, 7);
  await logSet(page, "Barbell Bench Press", 3, 6);
  const banner = card.getByText("Target hit!");
  await expect(banner).toBeVisible();
  // Bring the celebration up above the bottom bar, with the card's sets still in view.
  await page.evaluate(() => window.scrollBy(0, 170));
  await shot(page, "target-hit");

});

test("social preview image", async ({ browser }) => {
  // 1200 × 630 JPEG: small enough for WhatsApp and iMessage link previews.
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const img = (name: string) => `data:image/png;base64,${fs.readFileSync(`${OUT}/${name}.png`).toString("base64")}`;
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;box-sizing:border-box;background:radial-gradient(60% 70% at 78% 40%,rgba(195,237,137,.18),transparent),#131416;color:#eaebed;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;padding:0 80px;overflow:hidden;position:relative">
      <div style="width:500px;position:relative;z-index:1">
        <div style="font-size:44px;font-weight:700;letter-spacing:-2px">notchlift<span style="color:#c3ed89">.</span></div>
        <div style="margin-top:38px;font-size:60px;line-height:1.05;font-weight:700;letter-spacing:-2.5px">Know exactly what to lift next.</div>
        <div style="margin-top:26px;font-size:26px;line-height:1.4;color:#a9aeb3">Plan your split, log every set, and know when to add weight.</div>
      </div>
      ${[["logger", 650, -3, 280], ["target-hit", 890, 4, 265]]
        .map(([n, left, rot, w]) => `<div style="position:absolute;left:${left}px;top:70px;width:${w}px;transform:rotate(${rot}deg);border-radius:44px;background:#0b0c0d;border:1px solid rgba(255,255,255,.1);padding:10px;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)"><img src="${img(String(n))}" style="display:block;width:100%;border-radius:34px"></div>`)
        .join("")}
    </div></body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "src/app/opengraph-image.jpg", type: "jpeg", quality: 88 });
  await page.close();
});
