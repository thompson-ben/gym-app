/**
 * Training days: the weekdays someone usually trains, stored as ISO weekday numbers
 * (1 = Monday … 7 = Sunday). Pure; unit-tested.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const DAY_SHORT: Record<Weekday, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
export const DAY_NAME: Record<Weekday, string> = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" };

/** How many reminder emails someone gets on their training days before their first workout. */
export const MAX_TRAINING_REMINDERS = 4;

/** Valid, unique and in week order; anything else is dropped. */
export function normalizeDays(days: readonly number[] | null | undefined): Weekday[] {
  const set = new Set(days ?? []);
  return WEEKDAYS.filter((d) => set.has(d));
}

export function toggleDay(days: readonly Weekday[], day: Weekday): Weekday[] {
  return normalizeDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
}

/** [1, 4] → "Mondays and Thursdays"; [1, 3, 5] → "Mondays, Wednesdays and Fridays". */
export function formatDays(days: readonly number[], style: "plural" | "short" = "plural"): string {
  const names = normalizeDays(days).map((d) => (style === "short" ? DAY_SHORT[d] : `${DAY_NAME[d]}s`));
  if (names.length === 7 && style === "plural") return "every day";
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The ISO weekday of a moment in a time zone (the daily email job uses UK days). */
export function isoWeekday(date: Date, timeZone = "Europe/London"): Weekday {
  const short = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(date);
  const day = (Object.entries(DAY_SHORT) as [string, string][]).find(([, s]) => s === short)?.[0];
  return Number(day ?? 1) as Weekday;
}
