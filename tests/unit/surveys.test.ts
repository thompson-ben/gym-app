import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { cancellationReason } from "@/lib/billing/stripe-events";
import { SURVEYS, answerLabel, isSurveyAnswer, needsDetail, surveyFor } from "@/lib/surveys";

describe("one-question surveys", () => {
  it("picks one question per screen, the trial-ended question first on Train", () => {
    expect(surveyFor("train", ["heard_from", "trial_exit"])).toBe("trial_exit");
    expect(surveyFor("train", ["heard_from", "trial_pulse"])).toBe("heard_from");
    expect(surveyFor("train", ["trial_pulse"])).toBeNull();
    expect(surveyFor("finished", ["heard_from", "trial_pulse"])).toBe("trial_pulse");
    expect(surveyFor("finished", ["heard_from"])).toBeNull();
    expect(surveyFor("ended", ["trial_exit"])).toBe("trial_exit");
    expect(surveyFor("ended", [])).toBeNull();
  });

  it("asks for words only where they help", () => {
    expect(needsDetail("heard_from", "instagram")).toBe(false);
    expect(needsDetail("heard_from", "other")).toBe(true);
    expect(needsDetail("trial_exit", "too_expensive")).toBe(true);
    expect(SURVEYS.trial_exit.detailLabel("missing_feature")).toBe("Which feature?");
  });

  it("uses the answer codes the database accepts", () => {
    // Must match survey_answer_ok() in migration 19.
    expect(SURVEYS.heard_from.options.map((o) => o.value)).toEqual(["instagram", "facebook", "tiktok", "friend", "search", "other"]);
    expect(SURVEYS.trial_pulse.options.map((o) => o.value)).toEqual(["bad", "ok", "great"]);
    expect(SURVEYS.trial_exit.options.map((o) => o.value)).toEqual(["too_expensive", "not_training", "missing_feature", "other_app", "just_looking", "other"]);
    expect(isSurveyAnswer("trial_pulse", "skipped")).toBe(true);
    expect(isSurveyAnswer("trial_pulse", "meh")).toBe(false);
  });

  it("labels answers for the admin page", () => {
    expect(answerLabel("trial_pulse", "great")).toBe("😍 Love it");
    expect(answerLabel("cancel_reason", "unused")).toBe("Not using it enough");
    expect(answerLabel("heard_from", "skipped")).toBe("Skipped");
  });
});

describe("Stripe cancellation reason", () => {
  const sub = (d: Partial<Stripe.Subscription.CancellationDetails> | null) => ({ cancellation_details: d }) as unknown as Stripe.Subscription;

  it("reads the reason and comment a member gave Stripe", () => {
    expect(cancellationReason(sub({ feedback: "too_expensive", comment: "  Money is tight  ", reason: "cancellation_requested" }))).toEqual({
      reason: "too_expensive",
      comment: "Money is tight",
    });
    expect(cancellationReason(sub({ feedback: "unused", comment: "   " }))).toEqual({ reason: "unused", comment: null });
  });

  it("ignores subscriptions without one", () => {
    expect(cancellationReason(sub(null))).toBeNull();
    expect(cancellationReason(sub({ feedback: null, comment: "x", reason: "payment_failed" }))).toBeNull();
  });
});

describe("trial ended email", () => {
  it("reassures, asks one question and links to it", async () => {
    const { trialEndedEmail } = await import("@/lib/emails/trial-ended");
    const m = trialEndedEmail({ displayName: "Sam <b>", workouts: 3, siteUrl: "https://setmodo.com" });
    expect(m.subject).toBe("Your Setmodo trial has ended: one quick question");
    expect(m.html).toContain("Sam &lt;b&gt;");
    expect(m.html).toContain("the 3 workouts you logged are still there");
    expect(m.text).toContain("https://setmodo.com/upgrade?reason=trial_ended#why");
    expect(trialEndedEmail({ displayName: null, workouts: 0, siteUrl: "x" }).text).toContain("your splits are still there");
  });
});
