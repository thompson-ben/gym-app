"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { DAY_NAME, DAY_SHORT, WEEKDAYS, formatDays, normalizeDays, toggleDay, type Weekday } from "@/lib/training-days";
import { Button, ErrorNote, cx } from "./ui";

/** Seven day chips, Monday first. */
export function DayChips({ days, onToggle, disabled }: { days: readonly Weekday[]; onToggle: (day: Weekday) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Training days" className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={days.includes(d)}
          aria-label={DAY_NAME[d]}
          onClick={() => onToggle(d)}
          disabled={disabled}
          className={cx(
            "h-11 rounded-xl border text-sm transition",
            days.includes(d) ? "border-accent-text bg-accent-soft font-semibold text-fg" : "border-line text-fg/90 hover:bg-surface-2/60",
          )}
        >
          {DAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

async function saveDays(userId: string, days: Weekday[]) {
  return supabaseBrowser().from("profiles").upsert({ id: userId, training_days: days }, { onConflict: "id" });
}

/**
 * Asked once on Train, after a split is active and before a first workout: which days do you
 * train? Until that first workout, those mornings bring a short reminder email.
 */
export function TrainingDaysCard({ userId, className }: { userId: string; className?: string }) {
  const router = useRouter();
  const [days, setDays] = useState<Weekday[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Weekday[] | null>(null);

  async function submit(next: Weekday[]) {
    if (!navigator.onLine) return setError("You’re offline. Try again when you’re back online.");
    setBusy(true);
    setError(null);
    const { error } = await saveDays(userId, next);
    setBusy(false);
    if (error) return setError(friendlyError(error, "Not saved. Please try again."));
    setDone(next);
    router.refresh();
  }

  if (done) {
    return done.length ? (
      <p role="status" className={cx("rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted", className)}>
        Got it: {formatDays(done)}. We’ll email you on those mornings until your first workout. Change them any time in Profile.
      </p>
    ) : null;
  }
  return (
    <section aria-labelledby="training-days-title" className={cx("rounded-3xl border border-line bg-surface p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="training-days-title" className="font-semibold">Which days do you train?</h2>
        <button type="button" onClick={() => submit([])} disabled={busy} className="shrink-0 text-sm text-muted underline-offset-4 hover:underline">
          Skip
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">We’ll send a short reminder on those mornings with your workout ready, until you’ve logged your first one.</p>
      <div className="mt-3">
        <DayChips days={days} onToggle={(d) => setDays((s) => toggleDay(s, d))} disabled={busy} />
      </div>
      <Button variant="primary" size="md" className="mt-3 w-full" busy={busy} disabled={!days.length} onClick={() => submit(days)}>
        {days.length ? `Save ${formatDays(days, "short")}` : "Pick your days"}
      </Button>
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}

/** Profile: change training days; each tap saves. */
export function TrainingDaysRow({ userId, initial }: { userId: string; initial: number[] | null }) {
  const router = useRouter();
  const [days, setDays] = useState<Weekday[]>(normalizeDays(initial));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function toggle(day: Weekday) {
    const before = days;
    const next = toggleDay(days, day);
    setDays(next);
    setStatus("saving");
    const { error } = await saveDays(userId, next);
    if (error) {
      setDays(before);
      return setStatus("error");
    }
    setStatus("saved");
    router.refresh();
  }

  return (
    <div className="px-4 py-3">
      <p className="font-medium">Training days</p>
      <p className="mb-3 text-sm text-muted">The days you usually train. Until your first workout, we send a short reminder those mornings.</p>
      <DayChips days={days} onToggle={toggle} />
      <p aria-live="polite" className={cx("mt-1.5 text-sm", status === "error" ? "text-danger" : status === "saved" ? "text-accent-text" : "text-faint")}>
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved. Please try again." : days.length ? formatDays(days) : "None chosen"}
      </p>
    </div>
  );
}
