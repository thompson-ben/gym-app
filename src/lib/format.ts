import { isAddedWeight, isTimed, isUnloaded, type TrackingMode } from "./types";
import { formatWeightValue, type WeightUnit } from "./units";

const LABELS: Record<string, string> = {
  full_body: "Full body",
  smith_machine: "Smith machine",
  ez_bar: "EZ bar",
  trap_bar: "Trap bar",
};

export function humanize(value: string): string {
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** 72.5 -> "72.5", 70 -> "70", 72.25 -> "72.25". */
export function formatKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "";
  return String(Math.round(kg * 100) / 100);
}

/** "reps", or "s" for timed exercises (whose reps fields hold seconds). */
export const repUnit = (mode: TrackingMode | undefined) => (mode && isTimed(mode) ? "s" : "reps");

/** Column heading for the reps / seconds input. */
export const repColumn = (mode: TrackingMode | undefined) => (mode && isTimed(mode) ? "Secs" : "Reps");

/** Weight (stored in kg) and reps (or seconds) as shown in the Previous column, e.g. "72.5 × 9", "+10 × 10", "12 reps", "15 s", "+10 × 30 s", in the user's unit. */
export function formatSet(mode: TrackingMode, weight: number | null, reps: number | null, unit: WeightUnit = "kg"): string {
  const r = reps ?? "–";
  const amount = isTimed(mode) ? `${r} s` : `${r}`;
  if (isUnloaded(mode)) return isTimed(mode) ? amount : `${r} reps`;
  if (isAddedWeight(mode)) {
    return !weight ? `BW × ${amount}` : `+${formatWeightValue(weight, unit)} × ${amount}`;
  }
  return `${formatWeightValue(weight, unit)} × ${amount}`;
}

export function weightLabel(mode: TrackingMode, unit: WeightUnit = "kg"): string {
  return isAddedWeight(mode) ? `+${unit}` : unit;
}

/** "3 × 8–12", "3 × 10–15 s" for timed exercises, "3 sets", "8–12 reps". */
export function formatTarget(sets: number | null, repMin: number | null, repMax: number | null, mode?: TrackingMode): string {
  const range =
    repMin && repMax ? (repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`) : repMin ? `${repMin}+` : repMax ? `≤${repMax}` : null;
  const timed = mode && isTimed(mode);
  if (sets && range) return `${sets} × ${range}${timed ? " s" : ""}`;
  if (sets) return `${sets} ${sets === 1 ? "set" : "sets"}`;
  return range ? `${range} ${timed ? "s" : "reps"}` : "";
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDate(iso: string, timeZone?: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
    ...opts,
  })
    .format(new Date(iso))
    .replace("Sept", "Sep");
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return formatDate(iso, timeZone, { hour: "2-digit", minute: "2-digit" });
}

/** "3 weeks", "5 days", "2 months" — the time elapsed since a date. */
export function formatElapsed(fromIso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(fromIso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${Math.floor(days / 365.25)} years`;
}

/** Converts an ISO timestamp to the value of an <input type="datetime-local"> in a time zone. */
export function toLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Inverse of toLocalInput: interprets a wall-clock value in a time zone and returns ISO (UTC). */
export function fromLocalInput(value: string, timeZone: string): string {
  const [date, time] = value.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Offset of the zone at that instant, applied twice to settle DST boundaries.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const local = new Date(new Date(ts).toLocaleString("en-US", { timeZone }));
    const utc = new Date(new Date(ts).toLocaleString("en-US", { timeZone: "UTC" }));
    ts = guess - (local.getTime() - utc.getTime());
  }
  return new Date(ts).toISOString();
}

/** "2 working sets · 8–12 reps" as used on exercise cards ("Target" is reserved for suggestions). */
export function formatTargetLong(sets: number | null, repMin: number | null, repMax: number | null, mode?: TrackingMode): string {
  const parts: string[] = [];
  if (sets) parts.push(`${sets} working ${sets === 1 ? "set" : "sets"}`);
  const reps = formatTarget(null, repMin, repMax, mode);
  if (reps) parts.push(reps);
  return parts.join(" · ");
}

/** "21 Sep", with the year only when it differs from the current one. */
export function formatShortDate(iso: string, timeZone?: string, now: Date = new Date()): string {
  const year = (d: Date) => new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone }).format(d);
  const sameYear = year(new Date(iso)) === year(now);
  return formatDate(iso, timeZone, sameYear ? { year: undefined } : {});
}

/** "17:02" in the given time zone. */
export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

/**
 * Workout length in minutes, only when it is meaningful: logged live (not a past workout)
 * and between 5 minutes and 6 hours. Otherwise null and no duration is shown.
 */
export function meaningfulDurationMinutes(startedAt: string, completedAt: string | null, isBackdated: boolean | undefined): number | null {
  if (isBackdated || !completedAt) return null;
  const minutes = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60_000);
  return minutes >= 5 && minutes <= 360 ? minutes : null;
}

/** "1 h 5 min", "48 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
