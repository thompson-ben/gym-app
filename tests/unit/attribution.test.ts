import { describe, expect, it } from "vitest";
import { decodeTouch, deviceFromUserAgent, encodeTouch, isBot, isPublicPath, readTouch } from "@/lib/attribution";

const now = new Date("2026-10-07T12:00:00Z");
const read = (url: string, referrer = "") => readTouch(new URL(url), referrer, "notchlift.com", now);

describe("attribution", () => {
  it("reads campaign tags and Facebook ad clicks without keeping the click id", () => {
    const t = read("https://notchlift.com/?utm_source=facebook&utm_medium=paid&utm_campaign=launch-ppl&fbclid=IwAR123secret", "https://l.facebook.com/");
    expect(t).toEqual({
      landing_path: "/",
      utm_source: "facebook",
      utm_medium: "paid",
      utm_campaign: "launch-ppl",
      from_meta_ad: true,
      referrer_host: "l.facebook.com",
      first_seen_at: now.toISOString(),
    });
    expect(JSON.stringify(t)).not.toContain("IwAR123secret");
  });

  it("uses the referring site, ignores our own, and treats a plain visit as direct", () => {
    expect(read("https://notchlift.com/", "https://www.google.com/")?.referrer_host).toBe("www.google.com");
    expect(read("https://notchlift.com/", "https://notchlift.com/privacy")).toBeNull();
    expect(read("https://notchlift.com/")).toBeNull();
  });

  it("labels shared invite and split links, with their tokens blanked", () => {
    expect(read("https://notchlift.com/join/Ab3_x-9QkLmN0pQrStUvWxYz")).toMatchObject({ utm_source: "group-invite", landing_path: "/join/[token]" });
    expect(read("https://notchlift.com/s/Ab3_x-9QkLmN0pQrStUvWxYz")).toMatchObject({ utm_source: "split-share", landing_path: "/s/[token]" });
  });

  it("round-trips through the cookie and survives junk", () => {
    const t = read("https://notchlift.com/?utm_source=tiktok&utm_campaign=a%20b%3Bc")!;
    expect(decodeTouch(encodeTouch(t))).toEqual(t);
    expect(decodeTouch("not json")).toBeNull();
    expect(decodeTouch(undefined)).toBeNull();
  });

  it("classifies devices and bots, and which pages count as marketing traffic", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("mobile");
    expect(deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari")).toBe("mobile");
    expect(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(deviceFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("desktop");
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone)")).toBe(false);
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/join/abc")).toBe(true);
    expect(isPublicPath("/train")).toBe(false);
  });
});

describe("admin percentages", () => {
  it("shows a rate only when it means something", async () => {
    const { pct } = await import("@/lib/admin");
    expect(pct(3, 12)).toBe("25%");
    expect(pct(0, 0)).toBe("–");
    expect(pct(83, 27)).toBe("–");
  });
});
