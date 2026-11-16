/**
 * Schedules the training-day notifications on the phone (iOS app only; does nothing in a browser).
 * Called when the app opens, when training days change, and from Profile. Reads the member's
 * training days and active split, then replaces whatever was scheduled before.
 */

import { isNativeApp } from "./native";
import { supabaseBrowser } from "./supabase/client";
import { REMINDER_IDS, parseReminderPrefs, reminderNotifications, type ReminderPrefs } from "./training-reminders";

const PREFS_KEY = "sm-training-reminders";

/** The stored preferences as saved (a JSON string), or "" when none or storage is unavailable. */
export function readReminderPrefsRaw(): string {
  try {
    return window.localStorage.getItem(PREFS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function loadReminderPrefs(): ReminderPrefs {
  return parseReminderPrefs(readReminderPrefsRaw());
}

export function saveReminderPrefs(prefs: ReminderPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: today's choice still applies */
  }
}

export type SyncResult = "scheduled" | "none" | "denied" | "unavailable";

/**
 * Reschedules from the account. With `ask`, asks for notification permission the first time
 * (only after the member chose days or turned reminders on); without it, never prompts.
 */
export async function syncTrainingReminders(userId: string, { ask = false }: { ask?: boolean } = {}): Promise<SyncResult> {
  if (!isNativeApp()) return "unavailable";
  try {
    const supabase = supabaseBrowser();
    const [profile, period] = await Promise.all([
      supabase.from("profiles").select("training_days").eq("id", userId).maybeSingle(),
      supabase.from("split_active_periods").select("splits(name)").is("ended_at", null).maybeSingle(),
    ]);
    // Offline or the column missing: leave whatever is scheduled as it is.
    if (profile.error) return "unavailable";
    const days = (profile.data as { training_days: number[] | null } | null)?.training_days ?? [];
    const splitName = (period.data?.splits as unknown as { name: string } | null)?.name ?? null;
    const notifications = reminderNotifications(days, loadReminderPrefs(), splitName);

    // Imported here and never returned from an async function: a Capacitor plugin answers to
    // every property, including "then", so awaiting the plugin object itself hangs.
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) });
    if (!notifications.length) return "none";

    let { display } = await LocalNotifications.checkPermissions();
    if (ask && (display === "prompt" || display === "prompt-with-rationale")) ({ display } = await LocalNotifications.requestPermissions());
    if (display !== "granted") return "denied";
    await LocalNotifications.schedule({
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { on: { weekday: n.weekday, hour: n.hour, minute: n.minute }, allowWhileIdle: true },
        threadIdentifier: "training-day",
      })),
    });
    return "scheduled";
  } catch {
    /* plugin missing (an older app build) or refused */
    return "unavailable";
  }
}
