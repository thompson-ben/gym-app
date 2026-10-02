"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconChevronRight } from "./icons";
import { Button, Sheet, cx } from "./ui";
import type { ButtonSize, ButtonVariant } from "./styles";
import { WorkoutDateSheet, defaultPastDate } from "./WorkoutDateSheet";

/**
 * Starts a session with a client-generated id, so double taps and retries never create two.
 * The id is kept per template, and the server refuses a second in-progress session.
 */
function useStartSession() {
  const router = useRouter();
  const ids = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(templateId: string, performedAt: string | null): Promise<string | null> {
    if (busy) return null;
    setBusy(templateId);
    setError(null);
    const sessionId = ids.current.get(templateId) ?? crypto.randomUUID();
    ids.current.set(templateId, sessionId);
    const { error } = await supabaseBrowser().rpc("start_session", {
      p_session_id: sessionId,
      p_template_id: templateId,
      p_performed_at: performedAt,
    });
    if (error) {
      setBusy(null);
      if (error.message === "session_in_progress") router.refresh();
      const message = friendlyError(error, "Could not start the workout.");
      setError(message);
      return message;
    }
    router.push(`/workout/${sessionId}`);
    return null;
  }
  return { start, busy, error };
}

export function StartWorkoutButton({
  templateId,
  disabled,
  label = "Start",
  variant = "primary",
  size = "md",
  className,
  ariaLabel,
}: {
  templateId: string;
  disabled?: boolean;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  ariaLabel?: string;
}) {
  const { start, busy, error } = useStartSession();
  return (
    <span className={cx("inline-flex flex-col items-stretch gap-1", className)}>
      <Button variant={variant} size={size} onClick={() => start(templateId, null)} busy={busy === templateId} disabled={disabled} aria-label={ariaLabel}>
        {label}
      </Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

/**
 * Secondary action for logging a workout that was already done. With several workouts it
 * first asks which one, then when it was performed.
 */
export function LogPastWorkoutButton({
  workouts,
  disabled,
  label = "Log past workout",
  className,
  variant = "quiet",
  size = "md",
}: {
  workouts: { id: string; name: string }[];
  disabled?: boolean;
  label?: string;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { start } = useStartSession();
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || !workouts.length}
        onClick={() => (workouts.length === 1 ? setChosen(workouts[0]) : setChoosing(true))}
      >
        {label}
      </Button>
      <Sheet open={choosing && !chosen} onClose={() => setChoosing(false)} title="Log a past workout">
        <p className="mb-3 text-muted">Which workout did you do?</p>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {workouts.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => setChosen(w)} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                <IconChevronRight className="shrink-0 text-faint" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <WorkoutDateSheet
        open={chosen !== null}
        onClose={() => {
          setChosen(null);
          setChoosing(false);
        }}
        title={chosen ? `Log past ${chosen.name}` : "Log past workout"}
        description="For a workout you already did. It is saved on this date, and Previous compares it with the workout before it."
        initialIso={defaultPastDate()}
        confirmLabel="Start logging"
        onConfirm={(iso) => start(chosen!.id, iso)}
      />
    </>
  );
}
