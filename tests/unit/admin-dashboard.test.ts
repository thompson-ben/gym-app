import { describe, expect, it } from "vitest";
import { adminHref, decodeCampaign, mergeSources, parseInclude, toggleInclude } from "@/lib/admin";
import { readTouch } from "@/lib/attribution";

describe("admin dashboard helpers", () => {
  it("reads and toggles who is counted, in a fixed order", () => {
    expect(parseInclude(undefined)).toEqual([]);
    expect(parseInclude("friends,admins,nonsense")).toEqual(["admins", "friends"]);
    expect(toggleInclude(["friends"], "admins")).toEqual(["admins", "friends"]);
    expect(toggleInclude(["admins", "friends"], "admins")).toEqual(["friends"]);
  });

  it("builds dashboard links without the defaults", () => {
    expect(adminHref(30, [])).toBe("/admin");
    expect(adminHref(7, [])).toBe("/admin?days=7");
    expect(adminHref(30, ["admins", "tests"])).toBe("/admin?include=admins%2Ctests");
  });

  it("decodes campaign names that arrived encoded twice and merges their rows", () => {
    expect(decodeCampaign("NL+%E2%80%93+Sign-ups+%E2%80%93+Test+1")).toBe("NL – Sign-ups – Test 1");
    expect(decodeCampaign("launch-ppl")).toBe("launch-ppl");
    expect(decodeCampaign("bad%E2%80")).toBe("bad%E2%80");
    const rows = mergeSources([
      { source: "facebook", campaign: "NL – Sign-ups – Test 1", visits: 366, signups: 3, first_workout: 1 },
      { source: "facebook", campaign: "NL+%E2%80%93+Sign-ups+%E2%80%93+Test+1", visits: 24, signups: 0, first_workout: 0 },
      { source: "direct", campaign: "", visits: 84, signups: 9, first_workout: 1 },
    ]);
    expect(rows).toEqual([
      { source: "direct", campaign: "", visits: 84, signups: 9, first_workout: 1 },
      { source: "facebook", campaign: "NL – Sign-ups – Test 1", visits: 390, signups: 3, first_workout: 1 },
    ]);
  });

  it("stores double-encoded ad tags decoded", () => {
    const url = new URL("https://notchlift.com/?utm_source=facebook&utm_campaign=NL%2B%25E2%2580%2593%2BSign-ups");
    expect(readTouch(url, "", "notchlift.com", new Date())?.utm_campaign).toBe("NL – Sign-ups");
  });
});
