"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { healthAvailable, healthEnabled, requestHealthAccess, setHealthEnabled } from "@/lib/native-health";
import { cx } from "./ui";

const noSubscribe = () => () => {};

/**
 * Profile, in the iOS app (1.2 or later): save finished workouts to Apple Health. Hidden in a
 * browser and in older app builds. Turning it on shows Apple's Health permission sheet.
 */
export function AppleHealthRow() {
  const [available, setAvailable] = useState(false);
  const stored = useSyncExternalStore(noSubscribe, healthEnabled, () => false);
  const [changed, setChanged] = useState<boolean | null>(null);
  const on = changed ?? stored;
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void healthAvailable().then((ok) => live && setAvailable(ok));
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
      setNote("Done. Your next finished workout will appear in Health as strength training.");
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

  if (!available) return null;
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between gap-4 py-2">
        <div>
          <p id="apple-health" className="font-medium">Save workouts to Apple Health</p>
          <p className="text-sm text-muted">Finished workouts appear in Health and Fitness as strength training. Setmodo never reads your Health data.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-labelledby="apple-health"
          aria-checked={on}
          onClick={() => void toggle()}
          className={cx("relative h-8 w-13 shrink-0 rounded-full transition", on ? "bg-accent" : "bg-surface-3")}
        >
          <span className={cx("absolute top-1 h-6 w-6 rounded-full transition-all", on ? "left-6 bg-accent-ink" : "left-1 bg-fg/80")} />
        </button>
      </div>
      {note ? <p role="status" className="pb-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
