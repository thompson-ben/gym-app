import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, deleteUsers, pool } from "./helpers";

const users: string[] = [];
const SECRET = "announcement-test-secret-0123456789abcdef";
let previousHash: string | null = null;

beforeAll(async () => {
  previousHash = (await pool.query("select billing_secret_hash from app_settings where id")).rows[0].billing_secret_hash;
  await pool.query("update app_settings set billing_secret_hash = encode(extensions.digest($1::text, 'sha256'), 'hex') where id", [SECRET]);
});

afterAll(async () => {
  await pool.query("update app_settings set billing_secret_hash = $1 where id", [previousHash]);
  await deleteUsers(users);
  await pool.end();
});

describe("announcement emails (migration 39)", () => {
  it("reaches everyone once, skips people who turned emails off, and needs the billing secret", async () => {
    const a = await createUser("ann-a");
    const b = await createUser("ann-b");
    const off = await createUser("ann-off");
    users.push(a, b, off);
    await pool.query("update profiles set reminder_emails = false where id = $1", [off]);

    const due = async (id = "test-ann") => (await pool.query("select user_id from announcement_recipients($1, $2, 500)", [SECRET, id])).rows.map((r) => r.user_id);
    const first = await due();
    expect(first).toEqual(expect.arrayContaining([a, b]));
    expect(first).not.toContain(off);

    await pool.query("select mark_announcement_sent($1, 'test-ann', $2)", [SECRET, a]);
    await pool.query("select mark_announcement_sent($1, 'test-ann', $2)", [SECRET, a]);
    const second = await due();
    expect(second).not.toContain(a);
    expect(second).toContain(b);
    // A different announcement starts afresh.
    expect(await due("other-ann")).toContain(a);

    await expect(pool.query("select * from announcement_recipients('wrong', 'test-ann', 10)")).rejects.toThrow();
  });
});
