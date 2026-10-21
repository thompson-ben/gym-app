import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, deleteUsers, pool, user } from "./helpers";

const users: string[] = [];

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

const start = (uid: string, subject = "Workout didn’t save", body = "It said offline then lost a set.") =>
  as(user(uid), (q) => q("select support_start('logging', $1, $2, '/train', 'build-1', 'test agent') as t", [subject, body])).then((r) => r[0].t);

describe("support inbox (migration 30)", () => {
  it("lets a member start and reply to their own threads, and only theirs", async () => {
    const a = await createUser("support-a");
    const b = await createUser("support-b");
    users.push(a, b);

    const t = await start(a);
    expect(t.status).toBe("open");
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ author: "user", body: "It said offline then lost a set." });
    // The member's view never includes the admin-only details.
    expect(t.email).toBeUndefined();

    // Someone else can't read, open or reply to it.
    expect(await as(user(b), (q) => q("select id from support_threads"))).toHaveLength(0);
    expect(await as(user(b), (q) => q("select id from support_messages"))).toHaveLength(0);
    expect((await as(user(b), (q) => q("select support_open_thread($1) as t", [t.id])))[0].t).toBeNull();
    await expect(as(user(b), (q) => q("select support_reply($1, 'hi')", [t.id]))).rejects.toThrow(/thread_not_found/);
    // Nobody writes to the tables directly.
    await expect(as(user(a), (q) => q("insert into support_messages (thread_id, author, body) values ($1, 'support', 'fake')", [t.id]))).rejects.toThrow();
    await expect(as(user(a), (q) => q("update support_threads set status = 'closed' where id = $1", [t.id]))).rejects.toThrow();

    const replied = (await as(user(a), (q) => q("select support_reply($1, 'Also on Wednesday.') as t", [t.id])))[0].t;
    expect(replied.messages.map((m: { body: string }) => m.body)).toEqual(["It said offline then lost a set.", "Also on Wednesday."]);
    expect((await as(user(a), (q) => q("select id from support_threads")))).toHaveLength(1);

    await expect(start(a, " ", "body")).rejects.toThrow(/invalid_message/);
    await expect(start(a, "Subject", "x".repeat(4001))).rejects.toThrow(/invalid_message/);
  });

  it("limits new threads to five a day", async () => {
    const a = await createUser("support-limit");
    users.push(a);
    for (let i = 0; i < 5; i++) await start(a, `Question ${i}`);
    await expect(start(a, "Question 6")).rejects.toThrow(/too_many_messages/);
  });

  it("keeps the inbox to admins, and an admin reply shows as unread until opened", async () => {
    const member = await createUser("support-member");
    const admin = await createUser("support-admin");
    users.push(member, admin);
    await pool.query("insert into admins (user_id) values ($1)", [admin]);
    await pool.query("update profiles set display_name = 'Ben Thompson' where id = $1", [admin]);
    const t = await start(member);

    await expect(as(user(member), (q) => q("select admin_support_threads('open')"))).rejects.toThrow(/not_admin/);
    await expect(as(user(member), (q) => q("select admin_support_thread($1)", [t.id]))).rejects.toThrow(/not_admin/);
    await expect(as(user(member), (q) => q("select admin_support_reply($1, 'sneaky')", [t.id]))).rejects.toThrow(/not_admin/);
    await expect(as(user(member), (q) => q("select admin_support_set_status($1, 'closed')", [t.id]))).rejects.toThrow(/not_admin/);

    const inbox = (await as(user(admin), (q) => q("select admin_support_threads('open') as x")))[0].x;
    const row = inbox.threads.find((x: { id: string }) => x.id === t.id);
    expect(row).toMatchObject({ subject: "Workout didn’t save", messages: 1 });
    expect(row.email).toMatch(/support-member/);

    const full = (await as(user(admin), (q) => q("select admin_support_thread($1) as t", [t.id])))[0].t;
    expect(full).toMatchObject({ page: "/train", app_version: "build-1", user_agent: "test agent" });

    expect((await as(user(member), (q) => q("select support_unread() as n")))[0].n).toBe(0);
    const answered = (await as(user(admin), (q) => q("select admin_support_reply($1, 'Sorted, try again now.') as t", [t.id])))[0].t;
    expect(answered.status).toBe("answered");
    expect(answered.messages[1]).toMatchObject({ author: "support", admin_name: "Ben Thompson", body: "Sorted, try again now." });
    expect((await as(user(member), (q) => q("select support_unread() as n")))[0].n).toBe(1);

    // Opening it marks it read; replying reopens it.
    await as(user(member), (q) => q("select support_open_thread($1)", [t.id]));
    expect((await as(user(member), (q) => q("select support_unread() as n")))[0].n).toBe(0);
    await as(user(admin), (q) => q("select admin_support_reply($1, 'Closing this.', true)", [t.id]));
    expect((await pool.query("select status from support_threads where id = $1", [t.id])).rows[0].status).toBe("closed");
    await as(user(member), (q) => q("select support_reply($1, 'Still broken!')", [t.id]));
    expect((await pool.query("select status from support_threads where id = $1", [t.id])).rows[0].status).toBe("open");

    await as(user(admin), (q) => q("select admin_support_set_status($1, 'closed')", [t.id]));
    await expect(as(user(admin), (q) => q("select admin_support_set_status($1, 'deleted')", [t.id]))).rejects.toThrow(/invalid_status/);

    // Deleting the account deletes the conversation.
    await deleteUsers([member]);
    expect((await pool.query("select count(*)::int as n from support_messages where thread_id = $1", [t.id])).rows[0].n).toBe(0);
  });
});
