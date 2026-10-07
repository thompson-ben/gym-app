/**
 * Weight units. Every weight is stored in kilograms (the canonical unit, 4 decimal places);
 * a user's preferred unit is used only for display and input. 4 decimals in kg is precise
 * enough that any weight typed in pounds (to 0.01 lb) converts back to exactly what was typed.
 */
export type WeightUnit = "kg" | "lb";

export const KG_PER_LB = 0.45359237;
export const MAX_WEIGHT_KG = 1000;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export const isWeightUnit = (v: unknown): v is WeightUnit => v === "kg" || v === "lb";

/** kg → the user's unit, unrounded. */
export function toUnit(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

/** A value in the user's unit → kg, rounded to the stored precision (4 dp). */
export function fromUnit(value: number, unit: WeightUnit): number {
  return round(unit === "lb" ? value * KG_PER_LB : value, 4);
}

/** "72.5", "160", "47.5": a kg value shown in the user's unit, at most 2 decimals. */
export function formatWeightValue(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg === null || kg === undefined) return "";
  return String(round(toUnit(kg, unit), 2));
}

/** "72.5 kg" / "160 lb". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${formatWeightValue(kg, unit)} ${unit}`;
}

/** Largest weight accepted as input, in the user's unit. */
export const maxWeightIn = (unit: WeightUnit) => Math.floor(toUnit(MAX_WEIGHT_KG, unit));

/** Allowed progression increments, in each unit (the database allows up to 50 kg). */
export const INCREMENT_RANGE: Record<WeightUnit, { min: number; max: number; example: string }> = {
  kg: { min: 0.25, max: 50, example: "2.5" },
  lb: { min: 0.5, max: 110, example: "5" },
};

/**
 * Parses a progression increment typed in the user's unit. Returns kg, null for an empty
 * field, or an error message.
 */
export function parseIncrement(input: string, unit: WeightUnit): { kg: number | null } | { error: string } {
  const text = input.trim().replace(",", ".");
  if (!text) return { kg: null };
  const n = Number(text);
  const { min, max } = INCREMENT_RANGE[unit];
  if (!Number.isFinite(n) || n < min || n > max) return { error: `Choose a weight increment between ${min} and ${max} ${unit}.` };
  return { kg: Math.min(50, fromUnit(round(n, 2), unit)) };
}
