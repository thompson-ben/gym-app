import { describe, expect, it } from "vitest";
import { isNativeAppUserAgent } from "@/lib/native";

describe("native app detection", () => {
  it("recognises the iOS app's user agent and nothing else", () => {
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(isNativeAppUserAgent(`${safari.replace(" Safari/604.1", "")} NotchLiftApp/1`)).toBe(true);
    expect(isNativeAppUserAgent(safari)).toBe(false);
    expect(isNativeAppUserAgent("NotchLiftApp")).toBe(false);
    expect(isNativeAppUserAgent(null)).toBe(false);
  });
});
