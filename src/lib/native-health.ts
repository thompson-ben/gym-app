/**
 * Saving finished workouts to Apple Health, in the iOS app only. The native code is the
 * HealthWorkouts plugin in ios/App/App/SceneDelegate.swift; it only ever writes workouts and
 * never reads anything from Health. Off until the member turns it on in Profile. App builds
 * without the plugin (before 1.2) report it as unavailable, so nothing is shown.
 */

import { isNativeApp } from "./native";

type HealthWorkoutsPlugin = {
  /** `calories` is true from app 1.3, which can also save estimated active energy. */
  isAvailable(): Promise<{ available: boolean; calories?: boolean }>;
  requestAuthorization(): Promise<{ status: "granted" | "denied" | "unknown" | "unavailable"; calories?: "granted" | "denied" | "unknown" }>;
  saveWorkout(opts: { id: string; start: number; end: number; title: string; kcal?: number }): Promise<{ saved: boolean }>;
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
const CALORIES_KEY = "sm-apple-health-calories";
const BODY_KG_KEY = "sm-body-kg";
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

/** Estimated calories: on unless turned off (e.g. by Apple Watch wearers, whose Watch counts them). */
export function caloriesEnabled(): boolean {
  try {
    return window.localStorage.getItem(CALORIES_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setCaloriesEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(CALORIES_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}

/** Body weight for calorie estimates, in kg, kept on this phone only ("" when not set). */
export function bodyKgRaw(): string {
  try {
    return window.localStorage.getItem(BODY_KG_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setBodyKg(kg: number | null): void {
  try {
    if (kg) window.localStorage.setItem(BODY_KG_KEY, String(Math.round(kg * 10) / 10));
    else window.localStorage.removeItem(BODY_KG_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Whether this app build can save to Health (1.2+), and also calories (1.3+). */
export async function healthSupport(): Promise<{ available: boolean; calories: boolean }> {
  if (!isNativeApp()) return { available: false, calories: false };
  try {
    const r = await (await health()).p.isAvailable();
    return { available: r.available === true, calories: r.available === true && r.calories === true };
  } catch {
    return { available: false, calories: false };
  }
}

export async function healthAvailable(): Promise<boolean> {
  return (await healthSupport()).available;
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

/** Saves one finished workout (with estimated calories when given), once per workout on this phone. Never throws. */
export async function saveWorkoutToHealth(id: string, window_: { start: number; end: number }, title: string, kcal = 0): Promise<boolean> {
  if (!isNativeApp() || !healthEnabled()) return false;
  try {
    const saved = (window.localStorage.getItem(SAVED_KEY) ?? "").split(",");
    if (saved.includes(id)) return true;
    const { saved: ok } = await (await health()).p.saveWorkout({ id, start: window_.start, end: window_.end, title, ...(kcal > 0 ? { kcal } : {}) });
    if (ok) window.localStorage.setItem(SAVED_KEY, [...saved.filter(Boolean).slice(-49), id].join(","));
    return ok;
  } catch {
    return false;
  }
}
