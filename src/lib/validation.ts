import { maxWeightIn, type WeightUnit } from "./units";

export { MAX_WEIGHT_KG } from "./units";
export const MAX_REPS = 1000;

/**
 * Parses a weight field in the user's unit. Accepts "72.5" or "72,5". Returns the value in that
 * unit (convert with fromUnit before storing), null for empty, NaN for invalid.
 */
export function parseWeight(input: string, unit: WeightUnit = "kg"): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= maxWeightIn(unit) ? value : Number.NaN;
}

/** Parses a reps field: whole numbers only. */
export function parseReps(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,4}$/.test(trimmed)) return Number.NaN;
  const value = Number(trimmed);
  return value <= MAX_REPS ? value : Number.NaN;
}

export function isValidNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
