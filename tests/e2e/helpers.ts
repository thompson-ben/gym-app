import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const db = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 2 });

export type TestUser = { email: string; password: string; id: string; client: SupabaseClient };

export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@e2e.splitmate.test`;

/** A confirmed account (created with the local admin API), signed in for API seeding. */
export async function newUser(label: string): Promise<TestUser> {
  const email = uniqueEmail(label);
  const password = "correct-horse-battery";
  const admin = createClient(URL, process.env.SUPABASE_LOCAL_SECRET_KEY!, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("create user failed");
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { email, password, id: created.data.user.id, client };
}

/** Waits for the newest email to an address in the local Mailpit inbox and returns its first link. */
export async function emailLink(to: string, subject: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const hit = messages.find((m) => subject.test(m.Subject));
    if (hit) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { HTML: string };
      const href = message.HTML.match(/href="([^"]+)"/)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email "${subject}" for ${to}`);
}

export async function emailCount(to: string): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages: unknown[] }).messages.length;
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
