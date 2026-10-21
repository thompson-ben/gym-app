import { expect, test } from "@playwright/test";
import { db, expectNoHorizontalScroll, newUser, signIn } from "./helpers";

test("a member messages support from Profile, an admin replies from the inbox, and the member sees the reply", async ({ browser }) => {
  const member = await newUser("support-member");
  const admin = await newUser("support-admin");
  await db.query("insert into public.admins (user_id) values ($1)", [admin.id]);
  await db.query("update public.profiles set display_name = 'Ben' where id = $1", [admin.id]);
  const subject = `Set didn’t save ${member.id.slice(0, 6)}`;

  // Member: Profile → Help & support → FAQ → Message us.
  const m = await browser.newPage();
  await signIn(m, member);
  await m.goto("/profile");
  await m.getByRole("link", { name: /Help & support/ }).click();
  await m.waitForURL("**/profile/support");
  await m.getByText("Does it work without signal?").click();
  await expect(m.getByText(/Every set saves on your phone/)).toBeVisible();
  await expectNoHorizontalScroll(m);
  await m.getByRole("link", { name: "Message us" }).click();
  await m.getByText("Logging workouts").click();
  await m.getByRole("button", { name: "Send message" }).click();
  await expect(m.getByRole("alert").filter({ hasText: "Add a short subject." })).toBeVisible();
  await m.getByLabel("Subject").fill(subject);
  await m.getByLabel("Message").fill("I ticked my last set at the gym and it disappeared.");
  await m.getByRole("button", { name: "Send message" }).click();
  await m.waitForURL("**/profile/support/**");
  await expect(m.getByText("Thanks, your message has been sent.")).toBeVisible();
  await expect(m.getByText("I ticked my last set at the gym and it disappeared.")).toBeVisible();
  await expect(m.getByText("We usually reply within a day.")).toBeVisible();

  // Admin: Profile shows it waiting; reply from the inbox.
  const a = await browser.newPage();
  await signIn(a, admin);
  await a.goto("/profile");
  await expect(a.getByRole("link", { name: /Support inbox/ })).toContainText("waiting for a reply");
  await a.goto("/admin");
  await a.getByRole("link", { name: /Support inbox/ }).click();
  await a.waitForURL("**/admin/support");
  await a.getByRole("link", { name: new RegExp(subject) }).click();
  await expect(a.getByText(member.email)).toBeVisible();
  await expect(a.getByText("I ticked my last set at the gym and it disappeared.")).toBeVisible();
  await a.getByLabel("Reply as NotchLift").fill("Sorry about that. Open the app once with signal and it will sync.");
  await a.getByRole("button", { name: "Send", exact: true }).click();
  await expect(a.getByRole("list", { name: "Messages" }).getByText("Sorry about that. Open the app once with signal and it will sync.")).toBeVisible();
  await expect(a.getByText(/Answered/).first()).toBeVisible();
  await a.goto("/admin/support");
  await expect(a.getByRole("link", { name: new RegExp(subject) })).toHaveCount(0);
  await a.goto("/admin/support?status=answered");
  await expect(a.getByRole("link", { name: new RegExp(subject) })).toBeVisible();

  // Member: a new-reply badge, the reply from Ben, and their answer reopens it.
  await m.goto("/profile");
  await expect(m.getByRole("link", { name: /Help & support/ })).toContainText("You have a new reply");
  await m.goto("/profile/support");
  await expect(m.getByRole("link", { name: new RegExp(subject) })).toContainText("New reply");
  await m.getByRole("link", { name: new RegExp(subject) }).click();
  await expect(m.getByText("Ben from NotchLift", { exact: false })).toBeVisible();
  await expect(m.getByText("Sorry about that. Open the app once with signal and it will sync.")).toBeVisible();
  await m.getByLabel("Your reply").fill("That worked, thanks!");
  await m.getByRole("button", { name: "Send" }).click();
  await expect(m.getByRole("list", { name: "Messages" }).getByText("That worked, thanks!")).toBeVisible();
  await m.goto("/profile");
  await expect(m.getByRole("link", { name: /Help & support/ })).toContainText("Common questions");
  expect((await db.query("select status from public.support_threads where user_id = $1", [member.id])).rows[0].status).toBe("open");

  // Admin closes it without replying.
  await a.goto("/admin/support");
  await a.getByRole("link", { name: new RegExp(subject) }).click();
  await a.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(async () => (await db.query("select status from public.support_threads where user_id = $1", [member.id])).rows[0].status).toBe("closed");
  await m.close();
  await a.close();
});
