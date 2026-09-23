"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatElapsed, fromLocalInput, toLocalInput } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconEdit } from "../icons";
import { Button, ErrorNote, Field, IconButton, SectionTitle, Sheet, inputClass } from "../ui";

type Period = { id: string; started_at: string; ended_at: string | null; completed_workouts: number };

export function PeriodsList({ periods, timeZone }: { periods: Period[]; timeZone: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Period | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(p: Period) {
    setEditing(p);
    setError(null);
    setStart(toLocalInput(p.started_at, timeZone));
    setEnd(p.ended_at ? toLocalInput(p.ended_at, timeZone) : "");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !start) return;
    const startedAt = fromLocalInput(start, timeZone);
    const endedAt = editing.ended_at ? (end ? fromLocalInput(end, timeZone) : null) : null;
    if (editing.ended_at && !endedAt) return setError("A past period needs an end date.");
    if (endedAt && endedAt <= startedAt) return setError("The end must be after the start.");
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("update_active_period", {
      p_period_id: editing.id,
      p_started_at: startedAt,
      p_ended_at: endedAt,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setEditing(null);
    router.refresh();
  }

  if (periods.length === 0) return null;
  return (
    <section>
      <SectionTitle>Active periods</SectionTitle>
      <ol className="divide-y divide-line rounded-3xl border border-line bg-surface px-4">
        {periods.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {formatDate(p.started_at, timeZone)} – {p.ended_at ? formatDate(p.ended_at, timeZone) : "now"}
              </p>
              <p className="text-sm text-muted">
                {p.ended_at ? "" : `Active for ${formatElapsed(p.started_at)} · `}
                {p.completed_workouts} {p.completed_workouts === 1 ? "workout" : "workouts"} completed
              </p>
            </div>
            <IconButton label="Correct dates" onClick={() => open(p)}><IconEdit size={18} /></IconButton>
          </li>
        ))}
      </ol>
      <p className="mt-2 px-1 text-xs text-faint">Dates are shown in your time zone ({timeZone}).</p>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Correct period dates">
        <form onSubmit={save} className="space-y-4 pb-2">
          <Field label="Started">{(id) => <input id={id} type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} required />}</Field>
          {editing?.ended_at ? (
            <Field label="Ended">{(id) => <input id={id} type="datetime-local" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} required />}</Field>
          ) : (
            <p className="text-sm text-muted">This period is still open. It ends when you activate another split or end the active period.</p>
          )}
          <p className="text-sm text-faint">Periods cannot overlap and cannot be in the future.</p>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Save dates</Button>
        </form>
      </Sheet>
    </section>
  );
}
