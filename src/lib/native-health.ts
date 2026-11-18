/**
 * Saving finished workouts to Apple Health, in the iOS app only. The native code is the
 * HealthWorkouts plugin in ios/App/App/SceneDelegate.swift; it only ever writes workouts and
 * never reads anything from Health. Off until the member turns it on in Profile. App builds
 * without the plugin (before 1.2) report it as unavailable, so nothing is shown.
 */

import { isNativeApp } from "./native";

type HealthWorkoutsPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ status: "granted" | "denied" | "unknown" | "unavailable" }>;
  saveWorkout(opts: { id: string; start: number; end: number; title: string }): Promise<{ saved: boolean }>;
};

// Wrapped in an object and never returned from an async function: a Capacitor plugin answers
// to every property, including "then", so awaiting the plugin object itself hangs.
let plugin: { p: HealthWorkoutsPlugin } | null = null;
async function health(): Promise<{ p: HealthWorkoutsPlugin }> {
  if (!plugin) {
    const { registerPlugin } = await import("@capacitor/core");
    plugin = { p: registerPlugin<HealthWorkoutsPlugin>("HealthWorkouts") };
  }
  return plugin;
}

const PREF_KEY = "sm-apple-health";
const SAVED_KEY = "sm-apple-health-saved";

export function healthEnabled(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

export function setHealthEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}

/** Whether this app build can save to Health (iPhone with the 1.2 app or later). */
export async function healthAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    return (await (await health()).p.isAvailable()).available === true;
  } catch {
    return false;
  }
}

/** Shows Apple's Health permission sheet (the first time) and reports the outcome. */
export async function requestHealthAccess(): Promise<"granted" | "denied" | "unavailable"> {
  if (!isNativeApp()) return "unavailable";
  try {
    const { status } = await (await health()).p.requestAuthorization();
    return status === "granted" ? "granted" : status === "unavailable" ? "unavailable" : "denied";
  } catch {
    return "unavailable";
  }
}

/** Saves one finished workout, once per workout on this phone. Never throws. */
export async function saveWorkoutToHealth(id: string, window_: { start: number; end: number }, title: string): Promise<boolean> {
  if (!isNativeApp() || !healthEnabled()) return false;
  try {
    const saved = (window.localStorage.getItem(SAVED_KEY) ?? "").split(",");
    if (saved.includes(id)) return true;
    const { saved: ok } = await (await health()).p.saveWorkout({ id, start: window_.start, end: window_.end, title });
    if (ok) window.localStorage.setItem(SAVED_KEY, [...saved.filter(Boolean).slice(-49), id].join(","));
    return ok;
  } catch {
    return false;
  }
}
