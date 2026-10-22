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
  /** Added by migration 21. */
  rewards_all_time?: number;
  rewarded_paid?: number;
};

/** Shape of admin_surveys() (migration 19). Comments carry the email so the owner can follow up. */
export type AdminSurveys = {
  days: number;
  answers: { question: string; answer: string; count: number }[];
  by_campaign: { question: string; source: string; campaign: string; content: string; answer: string; count: number }[];
  comments: { question: string; answer: string; detail: string; at: string; email: string; source: string; campaign: string }[];
};

/** admin_ad_spend() (migration 21): spend in range against what it brought, per campaign and ad. */
export type AdResult = { spend_pence: number | null; visits: number; signups: number; activated: number; paid: number };
export type AdminAdSpend = {
  days: number;
  from: string;
  to: string;
  campaigns: (AdResult & { campaign: string; ads: (AdResult & { content: string })[] })[];
  entries: { id: number; start_day: string; end_day: string; campaign: string; content: string; amount_pence: number }[];
  known: { campaign: string; content: string }[];
};

/** £ cost per result, or "–" when there's no spend or no result yet. */
export function costPer(spendPence: number | null, count: number): string {
  return spendPence && count > 0 ? pounds(Math.round(spendPence / count)) : "–";
}

/** admin_refund_window() (migration 21). */
export type AdminRefundWindow = {
  total_pence: number;
  count: number;
  payments: { id: number; email: string | null; amount_pence: number; plan: string | null; paid_at: string; window_ends: string; refunded_at: string | null }[];
};

/** admin_glance() (migration 21): yesterday (UK day) and what's coming up. */
export type AdminGlance = {
  yesterday: string;
  visits: number;
  signups: number;
  first_workouts: number;
  payments: number;
  revenue_pence: number;
  trials_ending_3d: number;
  cancelling: number;
  billing_issues: number;
  new_comments: number;
};

/** admin_signup_steps (migration 23). */
export type AdminSignupSteps = {
  views: number;
  views_in_app: number;
  submits: number;
  oauth_apple: number;
  oauth_google: number;
  errors: { reason: string; count: number }[];
  methods: { email: number; apple: number; google: number };
};

export const SIGNUP_ERROR_LABELS: Record<string, string> = {
  invalid_email: "Email not accepted",
  short_password: "Password too short",
  weak_password: "Password too weak",
  already_registered: "Already had an account",
  rate_limited: "Too many attempts",
  network: "No connection",
  oauth_cancelled: "Cancelled Apple / Google",
  oauth_failed: "Apple / Google failed",
  other: "Other error",
};

/** Who can be added back into the figures (migration 24). Left out by default. */
export const INCLUDE_KEYS = ["admins", "friends", "tests"] as const;
export type IncludeKey = (typeof INCLUDE_KEYS)[number];
export const INCLUDE_LABELS: Record<IncludeKey, string> = { admins: "Admins", friends: "Free-access friends", tests: "Test accounts" };

/** "?include=friends,admins" → ["admins", "friends"]; unknown values are dropped. */
export function parseInclude(value: string | undefined): IncludeKey[] {
  const listed = new Set((value ?? "").split(",").map((s) => s.trim()));
  return INCLUDE_KEYS.filter((k) => listed.has(k));
}

/** The dashboard's address for a range and include list (omitting defaults). */
export function adminHref(days: number, include: readonly IncludeKey[]): string {
  const params = new URLSearchParams();
  if (days !== 30) params.set("days", String(days));
  if (include.length) params.set("include", include.join(","));
  const q = params.toString();
  return q ? `/admin?${q}` : "/admin";
}

/** Adds or removes one key, keeping a fixed order. */
export function toggleInclude(include: readonly IncludeKey[], key: IncludeKey): IncludeKey[] {
  const next = new Set(include);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return INCLUDE_KEYS.filter((k) => next.has(k));
}

export type Channel = "meta_ads" | "instagram" | "facebook" | "shares" | "search" | "direct" | "other";
export const CHANNEL_LABELS: Record<Channel, string> = {
  meta_ads: "Meta ads",
  instagram: "Instagram (bio, posts, stories)",
  facebook: "Facebook (not ads)",
  shares: "Friends’ invites & shared links",
  search: "Google & other search",
  direct: "Direct (typed in, untagged)",
  other: "Other websites",
};

/** admin_dashboard() (migration 24). Every account figure leaves out admins, friends and tests unless included. */
export type AdminDashboard = {
  days: number;
  since: string;
  include: IncludeKey[];
  excluded: Record<IncludeKey, number>;
  overview: { accounts: number; active_7d: number; workouts_total: number; paying: number; trials_running: number; mrr_pence: number };
  period: { visits: number; signups: number; first_workouts: number; workouts: number; active_users: number; revenue_pence: number; payments: number };
  funnel: { visits: number; signup_views: number; signups: number; confirmed: number; split: number; first_workout: number; paid: number; median_minutes_to_first: number | null };
  channels: { channel: Channel; visits: number; signups: number; trained: number; paid: number }[];
  shares: {
    invite_links: number;
    split_links: number;
    group_invites: number;
    visits: { link: number; group: number; split: number };
    signups: number;
    trained: number;
    paid: number;
    rewards: number;
  };
  trials: {
    ended: number;
    converted: number;
    ended_all: number;
    converted_all: number;
    running: number;
    ending_7d: number;
    paid_early: number;
    recent: { email: string; ended_at: string; converted: boolean; trained: boolean; workouts: number }[];
  };
  daily: { day: string; visits: number; signups: number; workouts: number }[];
};

/**
 * Undoes campaign names that arrive encoded twice by some ad links
 * ("NL+%E2%80%93+Sign-ups" → "NL – Sign-ups"). Anything else is returned unchanged.
 */
export function decodeCampaign(value: string): string {
  if (!/%[0-9a-f]{2}/i.test(value)) return value;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/** Merges source rows whose campaign names differ only by that encoding. */
export function mergeSources<T extends { source: string; campaign: string; visits: number; signups: number; first_workout: number }>(rows: T[]): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const campaign = decodeCampaign(row.campaign);
    const key = `${row.source}|${campaign}`;
    const prev = merged.get(key);
    merged.set(key, prev
      ? { ...prev, visits: prev.visits + row.visits, signups: prev.signups + row.signups, first_workout: prev.first_workout + row.first_workout }
      : { ...row, campaign });
  }
  return [...merged.values()].sort((a, b) => b.signups - a.signups || b.visits - a.visits);
}

/** admin_training_days (migration 26). by_day is Monday first. */
export type AdminTrainingDays = {
  picked: number;
  skipped: number;
  by_day: number[];
  reminded: number;
  reminded_trained: number;
  checkins: number;
  checkins_trained: number;
};

/** admin_demo (migration 27): the "Try a workout" demo. Events are counted once per browser tab. */
export type AdminDemo = { started: number; logged_set: number; tapped_signup: number; accounts: number; trained: number };

/** admin_engagement (migration 28): what visitors do before signing up, and new accounts' first steps. */
export type AdminEngagement = {
  visits_by_page: Record<string, number>;
  clicks: { path: string; detail: string; count: number }[];
  scroll: { path: string; detail: string; count: number }[];
  signup_started: number;
  consent_accepted: number;
  consent_declined: number;
  demo_three_sets: number;
  demo_finished: number;
  started_workout: number;
  logged_a_set: number;
};

export const SCROLL_ORDER = ["quarter", "half", "three_quarters", "bottom"] as const;

/** Button codes sent by the landing pages (TrackedLink). */
export const CLICK_LABELS: Record<string, string> = {
  hero_start: "Start free (top)",
  hero_try: "Try a workout (top)",
  nav_start: "Start free (menu)",
  nav_signin: "Sign in",
  pricing_start: "Start free (pricing)",
  final_start: "Start free (bottom)",
  final_try: "Try a workout (bottom)",
  log_last_session: "Log my last session",
  setup_help: "Send my programme",
  share_workout: "Share workout",
  save_for_gym: "Save it for the gym (not there yet)",
};

export function pageLabel(path: string): string {
  return path === "/" ? "Home page" : path === "/add-weight" ? "Ad page (/add-weight)" : path === "/train" ? "Train (new accounts)" : path === "/sessions" ? "Workout summary" : path === "/workout" ? "Workout logger" : path;
}

/** admin_time_of_day (migration 31): counts per hour (0–23) and weekday (Monday first), UK time. */
export type TimeSeries = { by_hour: number[]; by_weekday: number[] };
export type AdminTimeOfDay = { visits: TimeSeries; signups: TimeSeries; workouts: TimeSeries };

/** 18 → "6pm", 0 → "12am", 12 → "12pm". */
export function hourLabel(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  return `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`;
}

/**
 * The busiest run of `width` hours (wrapping past midnight), e.g. "6pm–9pm", with its share of
 * the day. Null when there's nothing to show. Ties go to the earliest start.
 */
export function busiestWindow(byHour: number[], width = 3): { label: string; count: number; share: number } | null {
  const total = byHour.reduce((n, x) => n + x, 0);
  if (!total || byHour.length !== 24) return null;
  let best = 0;
  let bestStart = 0;
  for (let start = 0; start < 24; start++) {
    let n = 0;
    for (let i = 0; i < width; i++) n += byHour[(start + i) % 24];
    if (n > best) {
      best = n;
      bestStart = start;
    }
  }
  return { label: `${hourLabel(bestStart)}–${hourLabel(bestStart + width)}`, count: best, share: best / total };
}

/** admin_trials_ending (migration 32): running trials by the UK day they end. */
export type AdminTrialsEnding = {
  running: number;
  trained: number;
  by_day: { day: string; ending: number; trained: number }[];
  /** Ending more than 30 days from now (e.g. extended by referrals). */
  later: number;
};

/** "Today", "Tomorrow" or "Thu 29 Oct", for a YYYY-MM-DD day relative to today's YYYY-MM-DD. */
export function endDayLabel(day: string, today: string): string {
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)).replace(",", "").replace("Sept", "Sep");
}
