import { describe, expect, it } from "vitest";
import { adminHref, busiestWindow, decodeCampaign, hourLabel, mergeSources, parseInclude, toggleInclude } from "@/lib/admin";
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

describe("time of day (migration 31)", () => {
  it("labels hours on a 12-hour clock", () => {
    expect([0, 1, 11, 12, 13, 23, 24].map(hourLabel)).toEqual(["12am", "1am", "11am", "12pm", "1pm", "11pm", "12am"]);
  });

  it("finds the busiest three hours, wrapping past midnight", () => {
    const evening = Array(24).fill(0);
    evening[18] = 3;
    evening[19] = 5;
    evening[20] = 2;
    evening[8] = 4;
    expect(busiestWindow(evening)).toEqual({ label: "6pm–9pm", count: 10, share: 10 / 14 });
    const late = Array(24).fill(0);
    late[23] = 2;
    late[0] = 2;
    late[1] = 1;
    expect(busiestWindow(late)?.label).toBe("11pm–2am");
    expect(busiestWindow(Array(24).fill(0))).toBeNull();
  });
});
