"use client";

import { useState } from "react";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { Button, ErrorNote, Field, Sheet, inputClass } from "./ui";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Default for a past workout: yesterday at 18:00 local time. */
export function defaultPastDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

/** Picks the date and time a workout was performed (never in the future). */
export function WorkoutDateSheet({
  open,
  onClose,
  title,
  description,
  initialIso,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  initialIso: string;
  confirmLabel: string;
  onConfirm: (iso: string) => Promise<string | null>;
}) {
  return open ? (
    <Inner title={title} description={description} initialIso={initialIso} confirmLabel={confirmLabel} onClose={onClose} onConfirm={onConfirm} />
  ) : null;
}

function Inner({
  title,
  description,
  initialIso,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  description?: string;
  initialIso: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (iso: string) => Promise<string | null>;
}) {
  const tz = zone();
  const [value, setValue] = useState(() => toLocalInput(initialIso, tz));
  const [max] = useState(() => toLocalInput(new Date().toISOString(), tz));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return setError("Choose a date and time.");
    const iso = fromLocalInput(value, tz);
    if (new Date(iso).getTime() > Date.now() + 60_000) return setError("The date cannot be in the future.");
    setBusy(true);
    setError(await onConfirm(iso));
    setBusy(false);
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <form onSubmit={submit} noValidate className="space-y-4 pb-2">
        {description ? <p className="text-muted">{description}</p> : null}
        <Field label="Date and time performed">
          {(id) => <input id={id} type="datetime-local" className={inputClass} value={value} max={max} onChange={(e) => setValue(e.target.value)} required />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>
          {confirmLabel}
        </Button>
      </form>
    </Sheet>
  );
}
