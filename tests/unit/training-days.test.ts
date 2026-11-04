import { describe, expect, it } from "vitest";
import { checkinEmail, fromWithName } from "@/lib/emails/checkin";
import { trainingDayEmail } from "@/lib/emails/training-day";
import { formatDays, isoWeekday, normalizeDays, toggleDay } from "@/lib/training-days";

describe("training days", () => {
  it("normalises, toggles and formats days in week order", () => {
    expect(normalizeDays([4, 1, 9, 4, 0])).toEqual([1, 4]);
    expect(normalizeDays(null)).toEqual([]);
    expect(toggleDay([1, 4], 3)).toEqual([1, 3, 4]);
    expect(toggleDay([1, 3, 4], 3)).toEqual([1, 4]);
    expect(formatDays([4, 1])).toBe("Mondays and Thursdays");
    expect(formatDays([1, 3, 5])).toBe("Mondays, Wednesdays and Fridays");
    expect(formatDays([6])).toBe("Saturdays");
    expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe("every day");
    expect(formatDays([1, 4], "short")).toBe("Mon and Thu");
    expect(formatDays([])).toBe("");
  });

  it("works out the UK weekday, including just after midnight in summer time", () => {
    expect(isoWeekday(new Date("2026-10-19T09:00:00Z"))).toBe(1); // Monday
    expect(isoWeekday(new Date("2026-10-18T23:30:00Z"))).toBe(1); // 00:30 Monday in London (BST)
    expect(isoWeekday(new Date("2026-10-18T23:30:00Z"), "UTC")).toBe(7);
  });
});

describe("training-day email", () => {
  const base = { displayName: "Sam", trainingDays: [1, 4], splitName: "Upper / Lower", workoutName: "Upper A", remindersSent: 0, siteUrl: "https://setmodo.com" };

  it("names today's waiting workout and the days they chose", () => {
    const m = trainingDayEmail(base, new Date("2026-10-19T09:00:00Z"));
    expect(m.subject).toBe("Upper A today?");
    expect(m.html).toContain("It’s Monday, one of your training days");
    expect(m.html).toContain("<strong>Upper A</strong>");
    expect(m.html).toContain("You said you train on Mondays and Thursdays");
    expect(m.html).toContain("https://setmodo.com/train");
    expect(m.text).toContain("until your first workout, then stop");
  });

  it("without a split, suggests picking one; the fourth says it's the last; names are escaped", () => {
    const m = trainingDayEmail({ ...base, displayName: "<b>x</b>", splitName: null, workoutName: null, remindersSent: 3 }, new Date("2026-10-22T09:00:00Z"));
    expect(m.subject).toBe("Training today?");
    expect(m.html).toContain("Pick a split");
    expect(m.html).toContain("This is the last of these reminders");
    expect(m.html).not.toContain("<b>x</b>");
  });
});

describe("week-one check-in email", () => {
  it("reads like a personal note and says how far they got", () => {
    const m = checkinEmail({ displayName: "Sam Smith", trainingDays: [1, 4], hasSplit: true, splitName: "Push / Pull / Legs", siteUrl: "https://setmodo.com" });
    expect(m.subject).toBe("Quick question about Setmodo");
    expect(m.text).toMatch(/^Hi Sam,/);
    expect(m.text).toContain("I’m Ben, I built Setmodo");
    expect(m.text).toContain("set up Push / Pull / Legs and planned to train on Mondays and Thursdays");
    expect(m.text).toContain("- Not sure how to use it");
    expect(m.html).not.toContain("<table"); // no banner or button
  });

  it("covers no split yet and escapes names", () => {
    const none = checkinEmail({ displayName: null, trainingDays: null, hasSplit: false, splitName: null, siteUrl: "https://setmodo.com" });
    expect(none.text).toMatch(/^Hi,/);
    expect(none.text).toContain("haven’t picked a split");
    expect(none.text).toContain("I’ll set a split up for you");
    const started = checkinEmail({ displayName: "<i>", trainingDays: [], hasSplit: true, splitName: null, siteUrl: "https://setmodo.com" });
    expect(started.text).toContain("started building a split");
    expect(started.html).not.toContain("<i>");
  });

  it("keeps the sending address and changes only the name", () => {
    expect(fromWithName("Setmodo <hello@setmodo.com>", "Ben from Setmodo")).toBe("Ben from Setmodo <hello@setmodo.com>");
    expect(fromWithName("hello@setmodo.com", "Ben")).toBe("Ben <hello@setmodo.com>");
  });
});
