"use client";

import { CONTACT_EMAIL, FOUNDER_NAME } from "@/lib/company";
import { trackDetail } from "@/lib/track";
import { LogPastWorkoutButton } from "./StartWorkoutButton";
import { cx } from "./ui";

/**
 * Before a first workout: log your most recent session from memory, so the first workout here
 * already has last time's numbers beside every set.
 */
export function LogLastSessionCard({ workouts, className }: { workouts: { id: string; name: string }[]; className?: string }) {
  return (
    <section aria-labelledby="log-last-title" className={cx("rounded-3xl border border-line bg-surface p-4", className)}>
      <h2 id="log-last-title" className="font-semibold">Trained recently?</h2>
      <p className="mt-1 text-sm text-muted">
        Log your last session from memory. Then your first workout here already shows last time’s numbers beside every set.
      </p>
      <div className="mt-3" onClickCapture={() => trackDetail("cta_click", "log_last_session")}>
        <LogPastWorkoutButton workouts={workouts} variant="secondary" size="md" label="Log my last session" className="w-full" />
      </div>
    </section>
  );
}

const SETUP_BODY = `Hi ${FOUNDER_NAME},

Here's my programme (screenshot attached, or typed below):



I train __ days a week.
`;

/** "Rather I set it up?": an email to the founder with a screenshot of their current programme. */
export function SetupHelp({ className }: { className?: string }) {
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Set up my Setmodo split")}&body=${encodeURIComponent(SETUP_BODY)}`;
  return (
    <p className={cx("rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted", className)}>
      <span className="font-medium text-fg">Rather I set it up?</span> Send me your programme (a screenshot of your Notes is fine) and I’ll build it
      for you, usually the same day. {FOUNDER_NAME}{" "}
      <a href={href} onClick={() => trackDetail("cta_click", "setup_help")} className="font-medium text-accent-text underline underline-offset-4">
        Send my programme
      </a>
    </p>
  );
}
