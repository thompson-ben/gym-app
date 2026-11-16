import { describe, expect, it } from "vitest";
import { REMINDER_TIMES, formatReminderTime, parseReminderPrefs, pluginWeekday, reminderNotifications } from "@/lib/training-reminders";

describe("training-day notifications", () => {
  it("schedules one per training day at the chosen time, with the plugin's Sunday-first weekdays", () => {
    const n = reminderNotifications([7, 1, 4, 4], { on: true, time: "05:30" }, "Push / Pull / Legs");
    expect(n.map((x) => x.id)).toEqual([4311, 4314, 4317]);
    expect(n.map((x) => x.weekday)).toEqual([2, 5, 1]);
    expect(n[0]).toMatchObject({ hour: 5, minute: 30, title: "Training day 💪" });
    expect(n[0].body).toContain("Push / Pull / Legs");
  });

  it("schedules nothing when turned off or without days, and nudges to pick a split without one", () => {
    expect(reminderNotifications([1, 3], { on: false, time: "07:00" }, null)).toEqual([]);
    expect(reminderNotifications(null, { on: true, time: "07:00" }, null)).toEqual([]);
    expect(reminderNotifications([2], { on: true, time: "07:00" }, null)[0].body).toContain("Pick a split");
  });

  it("maps ISO weekdays to the plugin's", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => pluginWeekday(d as 1))).toEqual([2, 3, 4, 5, 6, 7, 1]);
  });

  it("reads stored preferences safely and formats times", () => {
    expect(parseReminderPrefs(null)).toEqual({ on: true, time: "07:00" });
    expect(parseReminderPrefs("not json")).toEqual({ on: true, time: "07:00" });
    expect(parseReminderPrefs('{"on":false,"time":"05:30"}')).toEqual({ on: false, time: "05:30" });
    expect(parseReminderPrefs('{"on":true,"time":"03:00"}').time).toBe("07:00");
    expect(REMINDER_TIMES[0]).toBe("05:00");
    expect(REMINDER_TIMES.at(-1)).toBe("21:00");
    expect(formatReminderTime("07:00")).toBe("7am");
    expect(formatReminderTime("05:30")).toBe("5:30am");
    expect(formatReminderTime("12:00")).toBe("12pm");
    expect(formatReminderTime("17:30")).toBe("5:30pm");
  });
});
