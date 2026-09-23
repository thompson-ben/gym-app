"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button } from "./ui";

/** Starts a session with a client-generated id, so double taps and retries never create two. */
export function StartWorkoutButton({ templateId, disabled }: { templateId: string; disabled?: boolean }) {
  const router = useRouter();
  const sessionId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    sessionId.current ??= crypto.randomUUID();
    const { error } = await supabaseBrowser().rpc("start_session", { p_session_id: sessionId.current, p_template_id: templateId });
    if (error) {
      setBusy(false);
      if (error.message === "session_in_progress") {
        router.refresh();
      }
      setError(friendlyError(error, "Could not start the workout."));
      return;
    }
    router.push(`/workout/${sessionId.current}`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={start} busy={busy} disabled={disabled}>
        Start
      </Button>
      {error ? <p role="alert" className="max-w-40 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
