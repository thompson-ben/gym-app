import type { PostgrestError } from "@supabase/supabase-js";

const MESSAGES: Record<string, string> = {
  not_authenticated: "Your session has expired. Please sign in again.",
  split_not_found: "That split could not be found.",
  template_not_found: "That workout could not be found.",
  session_not_found: "That workout session could not be found.",
  session_in_progress: "You already have a workout in progress. Resume or discard it first.",
  session_discarded: "This workout was discarded.",
  session_already_completed: "This workout is already finished.",
  no_completed_sets: "No sets have been confirmed yet.",
  revision_mismatch: "This workout changed elsewhere. Sync and try again.",
  split_is_active: "This split is active. End its active period to archive it.",
  split_archived: "Archived splits cannot be activated. Restore it first.",
  period_overlaps: "Those dates overlap another active period.",
  period_range_invalid: "The end must be after the start.",
  period_starts_in_future: "The start cannot be in the future.",
  period_ends_in_future: "The end cannot be in the future.",
  period_is_open: "The current period stays open until you switch or deactivate.",
  period_end_required: "A past period needs an end date.",
  exercise_not_available: "That exercise is not available to you.",
  completed_set_requires_weight: "Enter a weight before confirming the set.",
  share_not_found: "This share link is no longer available.",
  mapped_exercise_not_available: "The chosen exercise is not available to you.",
  workout_date_in_future: "The workout date cannot be in the future.",
  workout_date_too_old: "That date is too far in the past.",
  workout_date_required: "Choose the date the workout was performed.",
  catalogue_exercise_missing: "An exercise in this split is no longer in the catalogue.",
};

export function friendlyError(error: Pick<PostgrestError, "message"> | Error | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const key = error.message?.trim();
  if (key && MESSAGES[key]) return MESSAGES[key];
  if (/fetch|network|load failed/i.test(key ?? "")) return "Could not reach the server. Check your connection.";
  if (/violates check constraint|invalid input/i.test(key ?? "")) return "Some values are out of range. Please check and try again.";
  return fallback;
}

/** True when the outcome of a request is unknown (no response, gateway or server failure). */
export function isRetryable(error: PostgrestError | null, status: number): boolean {
  if (!error) return false;
  if (status === 0 || status >= 500) return true;
  return !error.code && /fetch|network|load failed|timeout/i.test(error.message ?? "");
}
