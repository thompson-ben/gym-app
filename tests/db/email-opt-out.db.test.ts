import { afterAll, describe, expect, it } from "vitest";
import { anon, as, createUser, deleteUsers, pool } from "./helpers";

const users: string[] = [];
const SECRET = "test-billing-secret-0123456789abcdef0123456789";

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("reminder email opt-out (migration 25)", () => {
  it("is on by default, can be switched off with the billing secret, and is listed for the daily job", async () => {
    const prev = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
    await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
    try {
      const id = await createUser("optout");
      users.push(id);
      const listed = async () => (await as(anon, (q) => q("select user_id from reminder_opt_outs($1)", [SECRET]))).map((r: { user_id: string }) => r.user_id);
      expect((await pool.query("select reminder_emails from profiles where id = $1", [id])).rows[0].reminder_emails).toBe(true);
      expect(await listed()).not.toContain(id);

      await expect(as(anon, (q) => q("select set_reminder_emails($1, $2, false)", ["wrong-secret-0123456789abcdef0123456789", id]))).rejects.toThrow();
      await as(anon, (q) => q("select set_reminder_emails($1, $2, false)", [SECRET, id]));
      expect(await listed()).toContain(id);
      await expect(as(anon, (q) => q("select * from reminder_opt_outs($1)", ["wrong-secret-0123456789abcdef0123456789"]))).rejects.toThrow();

      await as(anon, (q) => q("select set_reminder_emails($1, $2, true)", [SECRET, id]));
      expect(await listed()).not.toContain(id);
    } finally {
      await pool.query("update app_settings set billing_secret_hash = $1 where id", [prev]);
    }
  });
});
