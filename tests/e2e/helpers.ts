import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const db = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 2 });

export type TestUser = { email: string; password: string; id: string; client: SupabaseClient };

/** Registers a fresh account through Supabase Auth (email confirmation is off locally). */
export async function newUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@e2e.splitmate.test`;
  const password = "correct-horse-battery";
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error("sign up failed");
  return { email, password, id: data.user.id, client };
}

export async function catalogueId(slug: string) {
  const { rows } = await db.query("select id from exercises where slug = $1", [slug]);
  return rows[0].id as string;
}

/** Creates a split with one workout via the API (as the user, through RLS). */
export async function seedSplit(user: TestUser, name: string, workout: string, slugs: string[], activate = true) {
  const c = user.client;
  const { data: split } = await c.from("splits").insert({ name }).select("id").single().throwOnError();
  const { data: tpl } = await c.from("workout_templates").insert({ split_id: split!.id, name: workout }).select("id").single().throwOnError();
  for (const [i, slug] of slugs.entries()) {
    await c.from("template_exercises").insert({ template_id: tpl!.id, exercise_id: await catalogueId(slug), position: i, target_sets: 2, rep_min: 8, rep_max: 12 }).throwOnError();
  }
  if (activate) await c.rpc("activate_split", { p_split_id: split!.id }).throwOnError();
  return { splitId: split!.id as string, templateId: tpl!.id as string };
}

export async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/train");
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Types reps (and optionally weight) for a set row and confirms it. */
export async function logSet(page: Page, exercise: string, set: number, reps: number, weight?: number) {
  const row = page.getByRole("group", { name: `${exercise}, set ${set}` });
  if (weight !== undefined) await row.getByLabel(/weight in kg|added weight/).fill(String(weight));
  await row.getByLabel(/reps$/).fill(String(reps));
  await row.getByRole("button", { name: new RegExp(`Confirm ${exercise}, set ${set}`) }).click();
  await expect(row.getByRole("button", { name: /completed/ })).toBeVisible();
}
