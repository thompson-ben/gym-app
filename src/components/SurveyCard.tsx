"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SURVEYS, SURVEY_DETAIL_MAX, needsDetail, type SurveyQuestion } from "@/lib/surveys";
import { Button, ErrorNote, cx } from "./ui";

/** One question, answered with a tap (plus optional words) or skipped. Never asked again either way. */
export function SurveyCard({ question, className }: { question: SurveyQuestion; className?: string }) {
  const survey = SURVEYS[question];
  const [answer, setAnswer] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"answered" | "skipped" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(value: string, words?: string) {
    if (!navigator.onLine) return setError("You’re offline. Try again when you’re back online.");
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc("submit_survey", { p_question: question, p_answer: value, p_detail: words?.trim() || null });
    setBusy(false);
    if (error) return setError("Could not send. Please try again.");
    setDone(value === "skipped" ? "skipped" : "answered");
  }

  function choose(value: string) {
    if (busy) return;
    if (needsDetail(question, value)) setAnswer(value);
    else void send(value);
  }

  if (done === "skipped") return null;
  if (done) {
    return (
      <p role="status" className={cx("rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted", className)}>{survey.thanks}</p>
    );
  }
  const emoji = survey.options.some((o) => o.emoji);
  return (
    <section aria-labelledby={`survey-${question}`} className={cx("rounded-3xl border border-line bg-surface p-4", className)} id="why">
      <div className="flex items-start justify-between gap-3">
        <h2 id={`survey-${question}`} className="font-semibold">{survey.title}</h2>
        <button type="button" onClick={() => send("skipped")} disabled={busy} className="shrink-0 text-sm text-muted underline-offset-4 hover:underline">
          Skip
        </button>
      </div>
      <div className={cx("mt-3", emoji ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2")}>
        {survey.options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={answer === o.value}
            onClick={() => choose(o.value)}
            disabled={busy}
            className={cx(
              "rounded-xl border text-sm transition",
              emoji ? "flex flex-col items-center gap-1 px-2 py-3" : "min-h-11 px-3.5 py-2 text-left",
              answer === o.value ? "border-accent-text bg-accent-soft font-medium text-fg" : "border-line text-fg/90 hover:bg-surface-2/60",
            )}
          >
            {o.emoji ? <span aria-hidden="true" className="text-2xl">{o.emoji}</span> : null}
            {o.label}
          </button>
        ))}
      </div>
      {answer ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(answer, detail);
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">{survey.detailLabel(answer)}</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={SURVEY_DETAIL_MAX}
              rows={2}
              className="w-full rounded-2xl border border-line bg-field p-3 text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>
          <Button type="submit" variant="primary" size="md" className="w-full" busy={busy}>Send</Button>
        </form>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}
