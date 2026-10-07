import { describe, expect, it } from "vitest";
import { scrubEvent, scrubUrl } from "@/lib/monitoring";

describe("monitoring privacy", () => {
  it("blanks invite and share tokens and auth parameters in URLs", () => {
    expect(scrubUrl("https://notchlift.com/join/Ab3_x-9QkLmN0pQrStUvWxYz")).toBe("https://notchlift.com/join/[token]");
    expect(scrubUrl("/s/Ab3_x-9QkLmN0pQrStUvWxYz?x=1")).toBe("/s/[token]?x=1");
    expect(scrubUrl("https://notchlift.com/?token_hash=pkce_123&type=email")).toBe("https://notchlift.com/?token_hash=[redacted]&type=email");
    expect(scrubUrl("/auth/reset?code=abc&next=%2Ftrain")).toBe("/auth/reset?code=[redacted]&next=%2Ftrain");
    expect(scrubUrl("/auth/confirm#access_token=xyz&refresh_token=abc")).toBe("/auth/confirm");
    expect(scrubUrl("/sign-in?email=ben%40example.com")).toBe("/sign-in?email=[redacted]");
    // Ordinary paths are untouched.
    expect(scrubUrl("/progress/87574666-0e80-2427-aea7-4153174daff3?metric=volume")).toBe("/progress/87574666-0e80-2427-aea7-4153174daff3?metric=volume");
  });

  it("strips personal data from error reports", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u1", email: "ben@example.com", ip_address: "1.2.3.4" },
      request: { url: "https://notchlift.com/join/Ab3_x-9QkLmN0pQrStUvWxYz", cookies: { sb: "secret" }, headers: { authorization: "Bearer x" }, query_string: "a=b", data: "{}" },
      breadcrumbs: [{ data: { url: "/s/Ab3_x-9QkLmN0pQrStUvWxYz" }, message: "signed in as ben@example.com" }],
      exception: { values: [{ type: "Error", value: "Could not load /join/Ab3_x-9QkLmN0pQrStUvWxYz for ben@example.com" }] },
    })!;
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://notchlift.com/join/[token]" });
    expect(event.breadcrumbs![0]).toEqual({ data: { url: "/s/[token]" }, message: "signed in as [email]" });
    expect(event.exception!.values![0].value).toBe("Could not load /join/[token] for [email]");
  });
});
