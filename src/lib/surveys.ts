/**
 * One-question surveys (migration 19). The answer codes must match survey_answer_ok() in the
 * database; the labels are what people see.
 */
export type SurveyQuestion = "heard_from" | "trial_pulse" | "trial_exit";

type Option = { value: string; label: string; emoji?: string };
type Survey = {
  title: string;
  options: Option[];
  /** Answers that open a short text box before sending; any other answer sends straight away. */
  detailFor: string[] | "all";
  detailLabel: (answer: string) => string;
  thanks: string;
};

export const SURVEYS: Record<SurveyQuestion, Survey> = {
  heard_from: {
    title: "How did you hear about Setmodo?",
    options: [
      { value: "instagram", label: "Instagram" },
      { value: "facebook", label: "Facebook" },
      { value: "tiktok", label: "TikTok" },
      { value: "friend", label: "A friend" },
      { value: "search", label: "Google" },
      { value: "other", label: "Other" },
    ],
    detailFor: ["other"],
    detailLabel: () => "Where did you hear about us?",
    thanks: "Thanks! That helps us know where to find more people like you.",
  },
  trial_pulse: {
    title: "How’s Setmodo working for you so far?",
    options: [
      { value: "bad", label: "Not great", emoji: "😕" },
      { value: "ok", label: "It’s OK", emoji: "🙂" },
      { value: "great", label: "Love it", emoji: "😍" },
    ],
    detailFor: "all",
    detailLabel: (a) => (a === "great" ? "What do you like most? (optional)" : "What one thing would make it better? (optional)"),
    thanks: "Thanks! Every answer is read.",
  },
  trial_exit: {
    title: "What stopped you from choosing a plan?",
    options: [
      { value: "too_expensive", label: "Too expensive" },
      { value: "not_training", label: "Not training enough to need it" },
      { value: "missing_feature", label: "Missing a feature" },
      { value: "other_app", label: "I prefer another app or notes" },
      { value: "just_looking", label: "Just having a look" },
      { value: "other", label: "Something else" },
    ],
    detailFor: "all",
    detailLabel: (a) =>
      a === "missing_feature" ? "Which feature?" : a === "other_app" ? "Which one, and what does it do better? (optional)" : a === "other" ? "Tell us more" : "Anything else? (optional)",
    thanks: "Thanks for telling us. It helps make Setmodo better.",
  },
};

export const SURVEY_DETAIL_MAX = 500;

export function needsDetail(question: SurveyQuestion, answer: string) {
  const d = SURVEYS[question].detailFor;
  return d === "all" || d.includes(answer);
}

export function isSurveyAnswer(question: SurveyQuestion, answer: string) {
  return answer === "skipped" || SURVEYS[question].options.some((o) => o.value === answer);
}

/** The one question a screen shows, from what the database says is due. */
export function surveyFor(screen: "train" | "finished" | "ended", due: readonly string[]): SurveyQuestion | null {
  const want: SurveyQuestion[] = screen === "train" ? ["trial_exit", "heard_from"] : screen === "finished" ? ["trial_pulse"] : ["trial_exit"];
  return want.find((q) => due.includes(q)) ?? null;
}

/** Admin labels, including Stripe's cancellation reasons. */
export const SURVEY_TITLES: Record<string, string> = {
  heard_from: "How they heard about us",
  trial_pulse: "Mid-trial: how’s it going?",
  trial_exit: "Trial ended: what stopped them?",
  cancel_reason: "Cancelled: reason given to Stripe",
};

const CANCEL_LABELS: Record<string, string> = {
  customer_service: "Customer service",
  low_quality: "Quality",
  missing_features: "Missing features",
  other: "Other",
  switched_service: "Switched to another service",
  too_complex: "Too complicated",
  too_expensive: "Too expensive",
  unused: "Not using it enough",
};

export function answerLabel(question: string, answer: string): string {
  if (answer === "skipped") return "Skipped";
  if (question === "cancel_reason") return CANCEL_LABELS[answer] ?? answer;
  const o = SURVEYS[question as SurveyQuestion]?.options.find((x) => x.value === answer);
  return o ? `${o.emoji ? `${o.emoji} ` : ""}${o.label}` : answer;
}
