import { describe, expect, it } from "vitest";
import { unsubscribeOneClickUrl, unsubscribePageUrl, unsubscribeToken, verifyUnsubscribe, withUnsubscribeFooter } from "@/lib/emails/unsubscribe";

const SECRET = "unit-test-billing-secret-0123456789abcdef";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("unsubscribe links", () => {
  it("accept their own signature only", () => {
    const t = unsubscribeToken(ID, SECRET);
    expect(t).toHaveLength(32);
    expect(verifyUnsubscribe(ID, t, SECRET)).toBe(true);
    expect(verifyUnsubscribe("1f8fad5b-d9cb-469f-a165-70867728950e", t, SECRET)).toBe(false);
    expect(verifyUnsubscribe(ID, t, "another-secret-0123456789abcdef0123")).toBe(false);
    expect(verifyUnsubscribe(ID, `${t.slice(0, -1)}x`, SECRET)).toBe(false);
    expect(verifyUnsubscribe("not-a-uuid", t, SECRET)).toBe(false);
    expect(verifyUnsubscribe(ID, t, null)).toBe(false);
    expect(verifyUnsubscribe(ID, undefined, SECRET)).toBe(false);
  });

  it("build the page and one-click addresses", () => {
    expect(unsubscribePageUrl("https://setmodo.com", ID, SECRET)).toBe(`https://setmodo.com/unsubscribe?u=${ID}&t=${unsubscribeToken(ID, SECRET)}`);
    expect(unsubscribeOneClickUrl("https://setmodo.com", ID, SECRET)).toMatch(/^https:\/\/setmodo\.com\/api\/unsubscribe\?u=/);
  });

  it("add a footer link inside the email body", () => {
    const html = withUnsubscribeFooter("<html><body><p>Hi</p></body></html>", "https://setmodo.com/unsubscribe?u=a&t=b");
    expect(html).toContain('href="https://setmodo.com/unsubscribe?u=a&amp;t=b"');
    expect(html.indexOf("Unsubscribe")).toBeLessThan(html.indexOf("</body>"));
  });
});
