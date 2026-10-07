/** Shape of admin_overview() (migration 13). Totals only; no personal data. */
export type AdminOverview = {
  days: number;
  since: string;
  totals: {
    accounts: number;
    visits: number;
    signup_views: number;
    signups: number;
    confirmed: number;
    first_workout: number;
    week2_eligible: number;
    week2_returned: number;
    workouts_logged: number;
    active_users: number;
  };
  daily: { day: string; visits: number; signups: number; workouts: number }[];
  sources: { source: string; campaign: string; visits: number; signups: number; first_workout: number }[];
  landing_pages: { path: string; visits: number }[];
  devices: Record<string, number>;
  countries: { country: string; visits: number }[];
  features: Record<"active_split" | "targets_on" | "pounds" | "groups_created" | "group_joins" | "group_sessions" | "quick_workouts" | "feedback", number>;
  memberships: Record<string, number>;
};

/**
 * "12%", or "–" when it isn't meaningful: nothing to divide by, or more in the later step than
 * the earlier one (e.g. sign-ups from before tracking began, or browsers that opt out of it).
 */
export function pct(part: number, whole: number): string {
  return whole > 0 && part <= whole ? `${Math.round((part / whole) * 100)}%` : "–";
}
