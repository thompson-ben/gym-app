import { expect, test } from "@playwright/test";
import { db, newUser, seedSplit, signIn, type TestUser } from "./helpers";

test.afterAll(async () => {
  await db.end();
});

async function logWorkout(user: TestUser, templateId: string, sets: [number, number][]) {
  const { data: doc } = await user.client.rpc("start_session", { p_session_id: crypto.randomUUID(), p_template_id: templateId }).throwOnError();
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

test("profile shows founding membership and exports only the user's own data", async ({ page }) => {
  const me = await newUser("export-me");
  const other = await newUser("export-other");
  const mine = await seedSplit(me, "Mine", "Chest, back", ["lat-pulldown"]);
  const theirs = await seedSplit(other, "Theirs", "Secret workout", ["dip"]);
  await logWorkout(me, mine.templateId, [[70, 12], [70, 10]]);
  await logWorkout(other, theirs.templateId, [[10, 8]]);

  await signIn(page, me);
  await page.goto("/profile");
  await expect(page.getByText("Founding member")).toBeVisible();

  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Export as spreadsheet/ }).click()]);
  expect(csvDownload.suggestedFilename()).toMatch(/^splitmate-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await (await csvDownload.createReadStream()).toArray()).join("");
  const rows = csv.replace("﻿", "").trim().split("\r\n");
  expect(rows).toHaveLength(3);
  expect(rows[1]).toContain(',"Chest, back",Mine,Lat Pulldown,1,working,70,12,load,no,');
  expect(csv).not.toContain("Secret workout");

  const [jsonDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Export everything/ }).click()]);
  const json = JSON.parse((await (await jsonDownload.createReadStream()).toArray()).join(""));
  expect(json).toMatchObject({ format: "splitmate-export", account: { email: me.email }, membership: { status: "founder" } });
  expect(json.splits.map((s: { name: string }) => s.name)).toEqual(["Mine"]);
  expect(json.workouts).toHaveLength(1);
  expect(JSON.stringify(json)).not.toContain("Secret workout");
});

test("deleting an account removes everything and signs out; other accounts are untouched", async ({ page }) => {
  const me = await newUser("delete-ui");
  const other = await newUser("delete-ui-other");
  const mine = await seedSplit(me, "Doomed", "A", ["lat-pulldown"]);
  await seedSplit(other, "Survivor", "B", ["dip"]);
  await logWorkout(me, mine.templateId, [[70, 12]]);

  await signIn(page, me);
  await page.goto("/profile");
  await page.getByRole("button", { name: /Delete account/ }).click();
  const confirm = page.getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await confirm.click();
  await page.waitForURL("**/sign-in?deleted=1");
  await expect(page.getByText("Your account and all its data have been deleted.")).toBeVisible();

  const { rows } = await db.query(
    "select (select count(*) from auth.users where id = $1)::int as users, (select count(*) from workout_sessions where user_id = $1)::int as sessions, (select count(*) from splits where user_id = $2)::int as other_splits",
    [me.id, other.id],
  );
  expect(rows[0]).toEqual({ users: 0, sessions: 0, other_splits: 1 });

  // The old session no longer opens the app.
  await page.goto("/train");
  await page.waitForURL("**/sign-in**");
  await page.getByLabel("Email").fill(me.email);
  await page.getByLabel("Password").fill(me.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("privacy and terms pages are public and linked from sign-up", async ({ page }) => {
  await page.goto("/sign-in?mode=sign-up");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByText(/Profile → Your data → Delete account/)).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(page.getByText(/not medical, physiotherapy or coaching advice/)).toBeVisible();
});
