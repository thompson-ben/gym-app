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

type ActivationCounts = {
  signups: number;
  split: number;
  first_workout: number;
  eligible7: number;
  second7: number;
  eligible14: number;
  second14: number;
  paid: number;
};

/** Shape of admin_activation() (migration 16): people who signed up in the range, minus admins and test accounts. */
export type AdminActivation = {
  days: number;
  since: string;
  excluded_accounts: number;
  totals: ActivationCounts & { confirmed: number; second_any: number; median_minutes_to_first_set: number | null };
  campaigns: (ActivationCounts & { source: string; campaign: string })[];
  test_accounts: { email: string; note: string | null }[];
};

/** "8 min", "3.5 h" or "2.1 days". */
export function duration(minutes: number | null): string {
  if (minutes == null) return "–";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

/** Shape of admin_referrals() (migration 18). Totals only. */
export type AdminReferrals = {
  sharers: number;
  referred: number;
  by_link: number;
  by_group: number;
  by_split: number;
  qualified: number;
  rewards: number;
  referred_paid: number;
};
