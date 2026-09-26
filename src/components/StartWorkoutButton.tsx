"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button } from "./ui";
import { WorkoutDateSheet, defaultPastDate } from "./WorkoutDateSheet";

/**
 * Starts a session with a client-generated id, so double taps and retries never create two.
 * "Log past workout" starts it for an earlier date instead of now.
 */
export function StartWorkoutButton({ templateId, templateName, disabled }: { templateId: string; templateName: string; disabled?: boolean }) {
  const router = useRouter();
  const sessionId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState(false);

  async function start(performedAt: string | null): Promise<string | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    sessionId.current ??= crypto.randomUUID();
    const { error } = await supabaseBrowser().rpc("start_session", {
      p_session_id: sessionId.current,
      p_template_id: templateId,
      p_performed_at: performedAt,
    });
    if (error) {
      setBusy(false);
      if (error.message === "session_in_progress") router.refresh();
      const message = friendlyError(error, "Could not start the workout.");
      setError(message);
      return message;
    }
    router.push(`/workout/${sessionId.current}`);
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={() => start(null)} busy={busy && !pickDate} disabled={disabled}>
        Start
      </Button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setPickDate(true)}
        className="h-9 rounded-xl px-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-40"
      >
        Log past workout
      </button>
      {error && !pickDate ? <p role="alert" className="max-w-40 text-right text-xs text-danger">{error}</p> : null}
      <WorkoutDateSheet
        open={pickDate}
        onClose={() => setPickDate(false)}
        title={`Log past ${templateName}`}
        description="For a workout you already did. It will be recorded on this date, and the Previous column will compare it with the workout before it."
        initialIso={defaultPastDate()}
        confirmLabel="Start logging"
        onConfirm={start}
      />
    </div>
  );
}
