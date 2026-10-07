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
  /** Added by migration 14. */
  billing?: {
    paying: number;
    monthly: number;
    yearly: number;
    canceling: number;
    billing_issue: number;
    revenue_pence: number;
    mrr_pence: number;
    trials_started: number;
    trials_active: number;
    trials_converted: number;
    trials_ended_unpaid: number;
  };
};

export const pounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * "12%", or "–" when it isn't meaningful: nothing to divide by, or more in the later step than
 * the earlier one (e.g. sign-ups from before tracking began, or browsers that opt out of it).
 */
export function pct(part: number, whole: number): string {
  return whole > 0 && part <= whole ? `${Math.round((part / whole) * 100)}%` : "–";
}
