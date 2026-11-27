"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { bodyKgRaw, caloriesEnabled, healthEnabled, healthSupport, requestHealthAccess, setBodyKg, setCaloriesEnabled, setHealthEnabled } from "@/lib/native-health";
import { formatWeightValue, fromUnit, type WeightUnit } from "@/lib/units";
import { cx } from "./ui";

const noSubscribe = () => () => {};

function Switch({ on, onClick, labelledBy }: { on: boolean; onClick: () => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-labelledby={labelledBy}
      aria-checked={on}
      onClick={onClick}
      className={cx("relative h-8 w-13 shrink-0 rounded-full transition", on ? "bg-accent" : "bg-surface-3")}
    >
      <span className={cx("absolute top-1 h-6 w-6 rounded-full transition-all", on ? "left-6 bg-accent-ink" : "left-1 bg-fg/80")} />
    </button>
  );
}

/**
 * Profile, in the iOS app (1.2 or later): save finished workouts to Apple Health. Hidden in a
 * browser and in older app builds. Turning it on shows Apple's Health permission sheet. From
 * 1.3, also estimated calories, from a body weight kept on this phone (Apple Watch wearers can
 * turn calories off, as their Watch already counts them).
 */
export function AppleHealthRow({ unit = "kg" }: { unit?: WeightUnit }) {
  const [support, setSupport] = useState({ available: false, calories: false });
  const stored = useSyncExternalStore(noSubscribe, healthEnabled, () => false);
  const [changed, setChanged] = useState<boolean | null>(null);
  const on = changed ?? stored;
  const storedCalories = useSyncExternalStore(noSubscribe, caloriesEnabled, () => true);
  const [caloriesChanged, setCaloriesChanged] = useState<boolean | null>(null);
  const calories = caloriesChanged ?? storedCalories;
  const storedKg = useSyncExternalStore(noSubscribe, bodyKgRaw, () => "");
  const [weightText, setWeightText] = useState<string | null>(null);
  const weightShown = weightText ?? (storedKg ? formatWeightValue(Number(storedKg), unit) : "");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void healthSupport().then((s) => live && setSupport(s));
    return () => {
      live = false;
    };
  }, []);

  async function toggle() {
    setNote(null);
    if (on) {
      setHealthEnabled(false);
      return setChanged(false);
    }
    const status = await requestHealthAccess();
    if (status === "granted") {
      setHealthEnabled(true);
      setChanged(true);
      setNote(
        support.calories && !storedKg
          ? "Done. Add your body weight below to include estimated calories."
          : "Done. Your next finished workout will appear in Health as strength training.",
      );
    } else {
      setHealthEnabled(false);
      setChanged(false);
      setNote(
        status === "unavailable"
          ? "Apple Health isn’t available on this device."
          : "Setmodo isn’t allowed to save workouts yet. In the Health app, go to your profile picture → Apps → Setmodo, and turn on Workouts.",
      );
    }
  }

  async function toggleCalories() {
    const next = !calories;
    setCaloriesEnabled(next);
    setCaloriesChanged(next);
    // Asks for Active Energy permission the first time (only the new type is shown).
    if (next) await requestHealthAccess();
  }

  function saveWeight(text: string) {
    setWeightText(text);
    const n = Number(text.replace(",", "."));
    setBodyKg(Number.isFinite(n) && n > 0 ? fromUnit(n, unit) : null);
  }

  if (!support.available) return null;
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between gap-4 py-2">
        <div>
          <p id="apple-health" className="font-medium">Save workouts to Apple Health</p>
          <p className="text-sm text-muted">Finished workouts appear in Health and Fitness as strength training. Setmodo never reads your Health data.</p>
        </div>
        <Switch on={on} onClick={() => void toggle()} labelledBy="apple-health" />
      </div>
      {on && support.calories ? (
        <>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p id="health-calories" className="font-medium">Include estimated calories</p>
              <p className="text-sm text-muted">Worked out from your session time and body weight. Turn off if you wear an Apple Watch that already tracks your workouts.</p>
            </div>
            <Switch on={calories} onClick={() => void toggleCalories()} labelledBy="health-calories" />
          </div>
          {calories ? (
            <label className="flex items-center justify-between gap-3 pb-2 text-sm">
              <span className="text-muted">Your body weight</span>
              <span className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  value={weightShown}
                  onChange={(e) => saveWeight(e.target.value)}
                  placeholder={unit === "lb" ? "e.g. 175" : "e.g. 80"}
                  className="w-24 rounded-xl border border-line bg-surface-2 px-3 py-2 text-right text-fg"
                  aria-label={`Body weight in ${unit}`}
                />
                <span className="text-muted">{unit}</span>
              </span>
            </label>
          ) : null}
          {calories ? <p className="pb-2 text-xs text-faint">Kept on this phone only. Used just for the calorie estimate.</p> : null}
        </>
      ) : null}
      {note ? <p role="status" className="pb-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
