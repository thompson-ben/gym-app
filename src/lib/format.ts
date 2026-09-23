import type { TrackingMode } from "./types";

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

/** Weight and reps as shown in the Previous column, e.g. "72.5 × 9", "+10 × 10", "12 reps". */
export function formatSet(mode: TrackingMode, weight: number | null, reps: number | null): string {
  const r = reps ?? "–";
  if (mode === "bodyweight_reps") return `${r} reps`;
  if (mode === "added_weight_reps") {
    return !weight ? `BW × ${r}` : `+${formatKg(weight)} × ${r}`;
  }
  return `${formatKg(weight)} × ${r}`;
}

export function weightLabel(mode: TrackingMode): string {
  return mode === "added_weight_reps" ? "+kg" : "kg";
}

export function formatTarget(sets: number | null, repMin: number | null, repMax: number | null): string {
  const reps =
    repMin && repMax ? (repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`) : repMin ? `${repMin}+` : repMax ? `≤${repMax}` : null;
  if (sets && reps) return `${sets} × ${reps}`;
  if (sets) return `${sets} ${sets === 1 ? "set" : "sets"}`;
  return reps ? `${reps} reps` : "";
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
