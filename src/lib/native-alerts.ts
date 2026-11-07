/**
 * Rest-over alerts and haptics in the iOS app. A web view can't vibrate or alert from the
 * background, so when a rest starts the app schedules one local notification for the moment it
 * ends (sound, vibration and a lock-screen banner, no server and no signal needed). Whenever the
 * rest changes (±15 s, restart, stop, finishing the workout) the alert is moved or cancelled.
 * In a browser these do nothing, apart from vibrating where the browser allows it (Android).
 */

import { isNativeApp } from "./native";
import type { RestTimer } from "./timer";

const REST_ALERT_ID = 4201;

/** When the rest-over alert should fire, or null for none: the rest's end time (pure, unit-tested). */
export function restAlertAt(timer: RestTimer, closed: boolean): number | null {
  if (!timer || closed) return null;
  return timer.startedAt + timer.duration * 1000;
}

// Plugins are imported inside each call and never returned from an async function: a Capacitor
// plugin answers to every property, including "then", so awaiting the plugin object itself hangs.

/** Schedules (or moves) the single rest-over alert. Asks for notification permission the first time. */
export async function scheduleRestAlert(at: number, workoutName: string): Promise<void> {
  if (!isNativeApp()) return;
  // Already over, or about to be: the on-screen timer covers it.
  if (at - Date.now() < 2000) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: REST_ALERT_ID }] });
    let { display } = await LocalNotifications.checkPermissions();
    if (display === "prompt" || display === "prompt-with-rationale") ({ display } = await LocalNotifications.requestPermissions());
    if (display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_ALERT_ID,
          title: "Rest over",
          body: `Time for your next set${workoutName ? ` · ${workoutName}` : ""} 💪`,
          schedule: { at: new Date(at), allowWhileIdle: true },
          threadIdentifier: "rest",
        },
      ],
    });
  } catch {
    /* plugin missing (an older app build) or refused: the on-screen timer still works */
  }
}

/** Cancels the rest-over alert, and clears it from the lock screen if it already fired. */
export async function cancelRestAlert(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: REST_ALERT_ID }] });
    await LocalNotifications.removeDeliveredNotificationsById?.({ ids: [REST_ALERT_ID] });
  } catch {
    /* nothing to cancel */
  }
}

/** A short buzz: "done" when rest ends or a hold reaches its target, "tap" when a hold starts. */
export function buzz(kind: "done" | "tap"): void {
  if (isNativeApp()) {
    void import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle, NotificationType }) =>
        kind === "done" ? Haptics.notification({ type: NotificationType.Success }) : Haptics.impact({ style: ImpactStyle.Medium }),
      )
      .catch(() => undefined);
    return;
  }
  navigator.vibrate?.(kind === "done" ? [120, 80, 120] : 80);
}
