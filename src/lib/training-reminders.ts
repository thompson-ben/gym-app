/**
 * Training-day notifications in the iOS app: one repeating local notification per chosen training
 * day, at a time the member picks (default 7am). Scheduled on the phone itself, so no server or
 * push service is involved. Pure; unit-tested. The native side is in native-reminders.ts.
 */

import { normalizeDays, type Weekday } from "./training-days";

/** Notification ids 4311–4317 (Monday–Sunday). The rest alert uses 4201. */
export const REMINDER_ID_BASE = 4310;
export const REMINDER_IDS = [1, 2, 3, 4, 5, 6, 7].map((d) => REMINDER_ID_BASE + d);

export type ReminderPrefs = { on: boolean; time: string };
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = { on: true, time: "07:00" };

/** Every half hour from 5am to 9pm. */
export const REMINDER_TIMES: readonly string[] = Array.from({ length: 33 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** Stored preferences (a JSON string from local storage), falling back to the defaults. */
export function parseReminderPrefs(raw: string | null | undefined): ReminderPrefs {
  try {
    const v = JSON.parse(raw ?? "") as Partial<ReminderPrefs>;
    return {
      on: typeof v.on === "boolean" ? v.on : DEFAULT_REMINDER_PREFS.on,
      time: typeof v.time === "string" && REMINDER_TIMES.includes(v.time) ? v.time : DEFAULT_REMINDER_PREFS.time,
    };
  } catch {
    return { ...DEFAULT_REMINDER_PREFS };
  }
}

/** "07:00" → "7am", "17:30" → "5:30pm". */
export function formatReminderTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** ISO weekday (1 = Monday) → the plugin's weekday (1 = Sunday). */
export const pluginWeekday = (day: Weekday): number => (day % 7) + 1;

export type ReminderNotification = { id: number; title: string; body: string; weekday: number; hour: number; minute: number };

/** The notifications to schedule: one per training day, none when turned off or no days are chosen. */
export function reminderNotifications(days: readonly number[] | null | undefined, prefs: ReminderPrefs, splitName: string | null): ReminderNotification[] {
  if (!prefs.on) return [];
  const [hour, minute] = prefs.time.split(":").map(Number);
  const body = splitName
    ? `Your ${splitName} workout is ready, with last time’s numbers beside every set. Open Setmodo and tap Start.`
    : "Pick a split in 2 minutes and you’re ready to train.";
  return normalizeDays(days).map((day) => ({
    id: REMINDER_ID_BASE + day,
    title: "Training day 💪",
    body,
    weekday: pluginWeekday(day),
    hour,
    minute,
  }));
}
