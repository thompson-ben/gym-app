"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconPlus } from "./icons";
import { Button, ErrorNote, Field, Input, Sheet } from "./ui";
import { WorkoutDateSheet, defaultPastDate } from "./WorkoutDateSheet";

/** Starts a one-off workout with no template: name it, then pick exercises as you go. */
export function QuickWorkoutButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const sessionId = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(performedAt: string | null): Promise<string | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    sessionId.current ??= crypto.randomUUID();
    const { error } = await supabaseBrowser().rpc("start_quick_session", {
      p_session_id: sessionId.current,
      p_name: name.trim() || null,
      p_performed_at: performedAt,
    });
    if (error) {
      setBusy(false);
      const message = friendlyError(error, "Could not start the workout.");
      setError(message);
      return message;
    }
    router.push(`/workout/${sessionId.current}`);
    return null;
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-line px-3 py-2.5 text-left transition hover:bg-surface disabled:opacity-50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent-text">
          <IconPlus size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">Quick workout</span>
          <span className="block text-sm text-muted">
            {disabled ? "Finish your current workout first" : "One-off session, pick exercises as you go"}
          </span>
        </span>
      </button>

      <Sheet
        open={open && !pickDate}
        onClose={() => setOpen(false)}
        title="Quick workout"
        footer={
          <div className="space-y-2">
            <Button variant="primary" size="lg" className="w-full" busy={busy} onClick={() => start(null)}>
              Start and choose exercises
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPickDate(true)}>
              Log a past quick workout
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Name (optional)" hint="Shown in your workout history. You can rename it later.">
            {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Quick workout" />}
          </Field>
          <p className="text-sm text-muted">
            Not part of any split. Every set still counts towards each exercise’s history and the Previous column.
          </p>
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Sheet>

      <WorkoutDateSheet
        open={pickDate}
        onClose={() => setPickDate(false)}
        title="Log a past quick workout"
        description="It will be saved for this date."
        initialIso={defaultPastDate()}
        confirmLabel="Start logging"
        onConfirm={start}
      />
    </>
  );
}
