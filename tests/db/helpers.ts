import { randomUUID } from "node:crypto";
import pg from "pg";

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

export const catalogueId = async (slug: string): Promise<string> => {
  const { rows } = await pool.query("select id from public.exercises where slug = $1", [slug]);
  if (!rows[0]) throw new Error(`catalogue exercise ${slug} missing`);
  return rows[0].id;
};

/** Creates an auth user (the profile is created by trigger). */
export async function createUser(label: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       '{"provider":"email"}', '{}', now(), now())`,
    [id, `${label}-${id.slice(0, 8)}@test.splitmate`],
  );
  return id;
}

export async function deleteUsers(ids: string[]) {
  if (ids.length) await pool.query("delete from auth.users where id = any($1)", [ids]);
}

type Role = { kind: "user"; id: string } | { kind: "anon" };

/**
 * Runs `fn` in its own committed transaction as the given role, exactly as PostgREST does:
 * `set local role` plus request.jwt.claims (which auth.uid() reads). RLS applies.
 */
export async function as<T>(role: Role, fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (role.kind === "anon") {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: role.id, role: "authenticated" }),
      ]);
    }
    const q: Query = async (text, params) => (await client.query(text, params)).rows;
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export type Query = (text: string, params?: unknown[]) => Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const user = (id: string): Role => ({ kind: "user", id });
export const anon: Role = { kind: "anon" };

export async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query("select 1 from public.exercises limit 1");
    return true;
  } catch {
    return false;
  }
}

// --- Domain helpers (all executed as the given user, through RLS) -----------------------

export async function createSplit(uid: string, name: string): Promise<string> {
  return as(user(uid), async (q) => (await q("insert into splits (name) values ($1) returning id", [name]))[0].id);
}

export async function createTemplate(
  uid: string,
  splitId: string,
  name: string,
  exercises: { exerciseId: string; sets?: number; repMin?: number; repMax?: number }[],
): Promise<{ templateId: string; entryIds: string[] }> {
  return as(user(uid), async (q) => {
    const [tpl] = await q("insert into workout_templates (split_id, name) values ($1, $2) returning id", [splitId, name]);
    const entryIds: string[] = [];
    for (const [i, e] of exercises.entries()) {
      const [row] = await q(
        `insert into template_exercises (template_id, exercise_id, position, target_sets, rep_min, rep_max)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [tpl.id, e.exerciseId, i, e.sets ?? 2, e.repMin ?? 8, e.repMax ?? 12],
      );
      entryIds.push(row.id);
    }
    return { templateId: tpl.id, entryIds };
  });
}

export type SetInput = { weight: number | null; reps: number | null; done: boolean; type?: "working" | "warmup" };
export type SessionDoc = {
  id: string;
  revision: number;
  status: string;
  template_name: string;
  split_name: string | null;
  notes: string | null;
  exercises: {
    id: string;
    exercise_id: string;
    template_exercise_id: string | null;
    position: number;
    exercise_name: string;
    target_sets: number | null;
    rep_min: number | null;
    rep_max: number | null;
    rest_seconds: number | null;
    template_notes: string | null;
    notes: string | null;
    skipped: boolean;
    sets: { id: string; position: number; set_type: string; weight_kg: number | null; reps: number | null; completed_at: string | null }[];
  }[];
};

export async function startSession(uid: string, templateId: string, sessionId = randomUUID()): Promise<SessionDoc> {
  return as(user(uid), async (q) => (await q("select start_session($1, $2) as doc", [sessionId, templateId]))[0].doc);
}

export function withSets(doc: SessionDoc, setsByExercise: SetInput[][]): SessionDoc {
  return {
    ...doc,
    exercises: doc.exercises.map((ex, i) => ({
      ...ex,
      sets: (setsByExercise[i] ?? []).map((s, j) => ({
        id: randomUUID(),
        position: j,
        set_type: s.type ?? "working",
        weight_kg: s.weight,
        reps: s.reps,
        completed_at: s.done ? new Date().toISOString() : null,
      })),
    })),
  };
}

export async function sync(uid: string, doc: SessionDoc, baseRevision: number, writeId = randomUUID()) {
  return as(user(uid), async (q) =>
    (await q("select sync_session($1, $2, $3, $4) as r", [doc.id, baseRevision, writeId, JSON.stringify(doc)]))[0].r,
  );
}

export async function finish(uid: string, sessionId: string, revision: number) {
  return as(user(uid), async (q) => (await q("select finish_session($1, $2) as r", [sessionId, revision]))[0].r);
}

/** Starts, logs and finishes a workout in one go. */
export async function logWorkout(uid: string, templateId: string, sets: SetInput[][]): Promise<string> {
  const doc = await startSession(uid, templateId);
  const res = await sync(uid, withSets(doc, sets), doc.revision);
  await finish(uid, doc.id, res.revision);
  return doc.id;
}
