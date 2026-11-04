import { describe, expect, it } from "vitest";
import { supportNoticeEmail, supportReplyEmail } from "../../src/lib/emails/support";
import { SUPPORT_FAQ, authorLabel, hasUnread, supportError, topicLabel, validateMessage } from "../../src/lib/support";

describe("support", () => {
  it("knows when a reply hasn't been opened", () => {
    expect(hasUnread({ last_support_at: null, user_seen_at: "2026-10-21T10:00:00Z" })).toBe(false);
    expect(hasUnread({ last_support_at: "2026-10-21T11:00:00Z", user_seen_at: "2026-10-21T10:00:00Z" })).toBe(true);
    expect(hasUnread({ last_support_at: "2026-10-21T09:00:00Z", user_seen_at: "2026-10-21T10:00:00Z" })).toBe(false);
  });

  it("names who wrote each message", () => {
    expect(authorLabel({ author: "user", admin_name: null })).toBe("You");
    expect(authorLabel({ author: "support", admin_name: "Ben Thompson" })).toBe("Ben from Setmodo");
    expect(authorLabel({ author: "support", admin_name: null })).toBe("Setmodo support");
  });

  it("checks messages before sending and explains server errors", () => {
    expect(validateMessage("", "hi")).toMatch(/subject/);
    expect(validateMessage("Hi", "  ")).toMatch(/message/);
    expect(validateMessage("x".repeat(121), "hi")).toMatch(/120/);
    expect(validateMessage(null, "x".repeat(4001))).toMatch(/4,000/);
    expect(validateMessage("Hi", "Help")).toBeNull();
    expect(validateMessage(null, "Thanks")).toBeNull();
    expect(supportError("ERROR: too_many_messages")).toMatch(/a lot of messages/);
    expect(supportError("something else")).toBeNull();
    expect(topicLabel("billing")).toBe("Trial & payments");
    expect(topicLabel("nope")).toBe("Something else");
  });

  it("has a FAQ with unique questions", () => {
    const qs = SUPPORT_FAQ.flatMap((g) => g.items.map((i) => i.q));
    expect(qs.length).toBeGreaterThan(8);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("emails the member the reply, escaped, with a link back to the conversation", () => {
    const e = supportReplyEmail({ displayName: "Sam Jones", subject: "Lost <set>", reply: "Fixed it.\n\nTry again & let me know.", fromName: "Ben Thompson", threadUrl: "https://setmodo.com/profile/support/abc" });
    expect(e.subject).toBe("Re: Lost <set>");
    expect(e.html).toContain("Lost &lt;set&gt;");
    expect(e.html).not.toContain("<set>");
    expect(e.html).toContain("Try again &amp; let me know.");
    expect(e.html).toContain("https://setmodo.com/profile/support/abc");
    expect(e.text).toContain("Hi Sam,");
    expect(e.text).toContain("Ben from Setmodo replied");
  });

  it("emails the inbox each new message with a link to Admin", () => {
    const e = supportNoticeEmail({ email: "sam@example.com", displayName: null, subject: "Billing", topic: "Trial & payments", body: "<b>hi</b>", isReply: true, adminUrl: "https://setmodo.com/admin/support/abc" });
    expect(e.subject).toBe("Support reply: Billing");
    expect(e.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(e.html).toContain("https://setmodo.com/admin/support/abc");
    expect(e.text).toContain("sam@example.com");
  });
});
