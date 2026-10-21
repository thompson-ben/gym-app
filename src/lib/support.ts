/**
 * Help & support: the FAQ, topics and the shape of support threads (migration 30). Pure;
 * unit-tested. Threads are read and written through the support_* SQL functions.
 */

export const SUPPORT_TOPICS = [
  { value: "logging", label: "Logging workouts" },
  { value: "account", label: "Account & sign-in" },
  { value: "billing", label: "Trial & payments" },
  { value: "bug", label: "Something’s broken" },
  { value: "other", label: "Something else" },
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];
export type SupportStatus = "open" | "answered" | "closed";

export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;

export type SupportMessage = { id: string; author: "user" | "support"; admin_name: string | null; body: string; created_at: string };
export type SupportThread = {
  id: string;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  created_at: string;
  last_user_at: string;
  last_support_at: string | null;
  user_seen_at: string;
  messages: SupportMessage[];
};
/** The admin view adds who it's from and where they were. */
export type AdminSupportThread = SupportThread & {
  email: string;
  display_name: string | null;
  joined_at: string;
  membership: string | null;
  page: string | null;
  app_version: string | null;
  user_agent: string | null;
};
export type AdminSupportList = {
  counts: Record<SupportStatus, number>;
  threads: { id: string; topic: SupportTopic; subject: string; status: SupportStatus; created_at: string; last_at: string; email: string; display_name: string | null; messages: number; preview: string }[];
};

export const topicLabel = (t: string) => SUPPORT_TOPICS.find((x) => x.value === t)?.label ?? "Something else";

/** What the member sees for each status. */
export const STATUS_LABEL: Record<SupportStatus, string> = { open: "Waiting for reply", answered: "Replied", closed: "Closed" };
/** What admins see. */
export const ADMIN_STATUS_LABEL: Record<SupportStatus, string> = { open: "Needs reply", answered: "Answered", closed: "Closed" };

/** Whether the member has a reply they haven't opened. */
export function hasUnread(t: Pick<SupportThread, "last_support_at" | "user_seen_at">): boolean {
  return Boolean(t.last_support_at && t.last_support_at > t.user_seen_at);
}

/** Who wrote a message, as the member sees it. */
export function authorLabel(m: Pick<SupportMessage, "author" | "admin_name">, you = "You"): string {
  if (m.author === "user") return you;
  return m.admin_name ? `${m.admin_name.trim().split(/\s+/)[0]} from NotchLift` : "NotchLift support";
}

/** A friendly message for the errors the support functions raise, or null when there isn't one. */
export function supportError(message: string | undefined): string | null {
  if (!message) return null;
  if (message.includes("too_many_messages")) return "You’ve sent a lot of messages today. Please wait for a reply, or email us.";
  if (message.includes("invalid_message")) return "Add a subject and a message (up to 4,000 characters).";
  if (message.includes("thread_not_found")) return "That conversation couldn’t be found.";
  if (message.includes("not_admin")) return "Only admins can do this.";
  return null;
}

/** Checks a new message before sending. Returns an error to show, or null. */
export function validateMessage(subject: string | null, body: string): string | null {
  if (subject !== null && !subject.trim()) return "Add a short subject.";
  if (subject !== null && subject.trim().length > SUBJECT_MAX) return `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (!body.trim()) return "Write your message first.";
  if (body.trim().length > BODY_MAX) return `Keep it under ${BODY_MAX.toLocaleString("en-GB")} characters.`;
  return null;
}

export type FaqItem = { q: string; a: string };
export type FaqGroup = { title: string; items: FaqItem[] };

export const SUPPORT_FAQ: FaqGroup[] = [
  {
    title: "Getting started",
    items: [
      { q: "How do I add NotchLift to my home screen?", a: "On iPhone, open notchlift.com in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, tap ⋮, then Install app (or Add to Home screen). It then opens full screen like any other app." },
      { q: "How do I start a workout?", a: "Open Train. Your next workout from your active split is at the top: tap Start. To train without a plan, use Quick workout. Already trained today? Use Log past workout, top right." },
      { q: "Can I change my split or exercises later?", a: "Yes, any time, in Splits. Changes apply to future workouts; workouts you’ve already logged keep what they were. Every exercise keeps its history when you change split." },
    ],
  },
  {
    title: "Logging",
    items: [
      { q: "Does it work without signal?", a: "Yes. Every set saves on your phone the moment you tick it, and syncs when you’re back online. Keep the app open until it shows Saved before you delete it or clear your browser data." },
      { q: "How do targets work?", a: "Switch on targets for an exercise in the workout editor. When every working set reaches the top of your rep range, your next target adds weight (your chosen increment). Otherwise it keeps the weight and aims for more reps." },
      { q: "How do I log a superset?", a: "In the workout editor, tap Superset with next on the first exercise. During the workout they’re grouped as A1, A2, and the rest timer starts only after a set of each." },
      { q: "I made a mistake in a workout I’ve finished. Can I fix it?", a: "Yes. Open it from History and tap Edit. Records and progress update to match." },
      { q: "Can I switch between kg and lb?", a: "Yes, in Profile → Weight unit. Everything converts exactly, and you can switch back any time." },
    ],
  },
  {
    title: "Account & payments",
    items: [
      { q: "I didn’t get the confirmation or reset email.", a: "Check your junk or spam folder, and Promotions in Gmail. Emails come from hello@notchlift.com. If it still isn’t there after a few minutes, send us a message below." },
      { q: "What happens when my trial ends?", a: "You can keep viewing your history, progress and records, and export them, but you’ll need a plan to log new workouts. Nothing is deleted." },
      { q: "How do I cancel or change my plan?", a: "Profile → Manage subscription. Cancelling stops future payments, and you keep access until the end of the period you’ve paid for." },
      { q: "How do I export or delete my data?", a: "Profile → Your data: export everything as a spreadsheet or JSON, or delete your account. Deleting removes your workouts and history permanently." },
    ],
  },
];
